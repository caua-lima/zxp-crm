import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { PGlite } from "@electric-sql/pglite";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

/**
 * Executa as migrations de VERDADE num Postgres em WASM (pglite) — não é mock
 * de SQL. O que isto prova: o script roda, é idempotente, os gatilhos fazem o
 * que o código assume e as permissões fecham o acesso das chaves públicas.
 *
 * O que NÃO prova: o comportamento do PostgREST/Supabase em produção, o RLS
 * efetivo do banco real (para isso existe supabase/verificacao/inspecao.sql) e
 * concorrência real — o pglite tem uma conexão só, então "duas falhas
 * simultâneas" são testadas em sequência, e a atomicidade vem do upsert.
 */

const ler = (caminho: string) =>
  readFileSync(fileURLToPath(new URL(caminho, import.meta.url)), "utf8");

const SCHEMA_LP = ler("../fixtures/lp-schema.sql");
const SCHEMA_LEGADO = ler("../fixtures/lp-schema-legado.sql");
const MIGRATION = ler("../../supabase/migrations/crm_0001_seguranca_e_integridade.sql");
const ROLLBACK = ler("../../supabase/rollback/crm_0001_rollback.sql");

const ROLES = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
`;

const CHAVE = "a".repeat(32);

async function novoBanco(schema = SCHEMA_LP) {
  const db = new PGlite();
  await db.exec(ROLES);
  await db.exec(schema);
  return db;
}

async function inserirLead(db: PGlite) {
  const r = await db.query<{ id: string }>(
    `insert into public.leads (nome, whatsapp, email, idade, peso, consentimento_em)
     values ('Ana Teste', '(11) 91234-5678', 'ana@exemplo.com', '18 a 21', 'Outro', now())
     returning id`,
  );
  return r.rows[0].id;
}

/** Banco compartilhado pelo grupo (subir um pglite por teste leva ~3s cada). */
async function limpar(db: PGlite) {
  await db.exec(
    `truncate public.leads, public.lead_eventos, public.crm_sessoes, public.crm_login_tentativas restart identity cascade`,
  );
}

describe("crm_0001 — aplicação", () => {
  it("aborta sem alterar nada quando faltam as migrations da LP", async () => {
    const db = await novoBanco(SCHEMA_LEGADO);

    await expect(db.exec(MIGRATION)).rejects.toThrow(/migration 0001 da LP/);

    const colunas = await db.query(
      `select column_name from information_schema.columns
       where table_name = 'leads' and column_name = 'versao'`,
    );
    expect(colunas.rows).toHaveLength(0);
  });

  it("aborta com mensagem clara quando a tabela leads não existe", async () => {
    const db = new PGlite();
    await db.exec(ROLES);

    await expect(db.exec(MIGRATION)).rejects.toThrow(/Tabela public\.leads não existe/);
  });

  it("é idempotente: rodar duas vezes não falha nem duplica", async () => {
    const db = await novoBanco();

    await db.exec(MIGRATION);
    await expect(db.exec(MIGRATION)).resolves.toBeDefined();

    const gatilhos = await db.query(
      `select tgname from pg_trigger where tgname like 'crm\\_leads%' and not tgisinternal`,
    );
    expect(gatilhos.rows).toHaveLength(2);
  });

  it("preserva leads que já existiam, com defaults seguros", async () => {
    const db = await novoBanco();
    const id = await inserirLead(db);

    await db.exec(MIGRATION);

    const r = await db.query<Record<string, unknown>>(
      `select versao, atualizado_em, proxima_acao_em, nao_contatar_em, whatsapp_digitos, status, observacoes
       from public.leads where id = $1`,
      [id],
    );

    expect(r.rows[0]).toMatchObject({
      versao: 1,
      atualizado_em: null,
      proxima_acao_em: null,
      nao_contatar_em: null,
      whatsapp_digitos: "11912345678",
      status: "novo",
      observacoes: null,
    });
  });
});

describe("crm_0001 — controle de versão", () => {
  let db: PGlite;
  let id: string;

  beforeAll(async () => {
    db = await novoBanco();
    await db.exec(MIGRATION);
  });

  beforeEach(async () => {
    await limpar(db);
    id = await inserirLead(db);
  });

  it("sobe a versão quando algo editável pelo CRM muda", async () => {
    await db.query(`update public.leads set observacoes = 'primeira' where id = $1`, [id]);

    const r = await db.query<{ versao: number; atualizado_em: Date | null }>(
      `select versao, atualizado_em from public.leads where id = $1`,
      [id],
    );
    expect(r.rows[0].versao).toBe(2);
    expect(r.rows[0].atualizado_em).not.toBeNull();
  });

  it("NÃO sobe a versão quando só a LP mexe (aviso por e-mail)", async () => {
    await db.query(`update public.leads set notificado_em = now() where id = $1`, [id]);

    const r = await db.query<{ versao: number }>(
      `select versao from public.leads where id = $1`,
      [id],
    );
    expect(r.rows[0].versao).toBe(1);
  });

  it("ignora a versão enviada pelo cliente: quem manda é o banco", async () => {
    await db.query(
      `update public.leads set observacoes = 'x', versao = 999 where id = $1`,
      [id],
    );

    const r = await db.query<{ versao: number }>(
      `select versao from public.leads where id = $1`,
      [id],
    );
    expect(r.rows[0].versao).toBe(2);
  });

  it("escrita condicionada à versão: a segunda sessão perde e não sobrescreve", async () => {
    // Duas abas leram a versão 1.
    const aba1 = await db.query(
      `update public.leads set observacoes = 'aba 1'
       where id = $1 and versao = 1 returning versao`,
      [id],
    );
    const aba2 = await db.query(
      `update public.leads set observacoes = 'aba 2'
       where id = $1 and versao = 1 returning versao`,
      [id],
    );

    expect(aba1.rows).toHaveLength(1);
    expect(aba2.rows).toHaveLength(0);

    const final = await db.query<{ observacoes: string }>(
      `select observacoes from public.leads where id = $1`,
      [id],
    );
    expect(final.rows[0].observacoes).toBe("aba 1");
  });

  it("rejeita anotação acima de 5.000 caracteres e aceita exatamente 5.000", async () => {
    await expect(
      db.query(`update public.leads set observacoes = $2 where id = $1`, [id, "x".repeat(5001)]),
    ).rejects.toThrow(/leads_observacoes_tamanho/);

    await expect(
      db.query(`update public.leads set observacoes = $2 where id = $1`, [id, "x".repeat(5000)]),
    ).resolves.toBeDefined();
  });

  it("rejeita próxima ação acima de 120 caracteres", async () => {
    await expect(
      db.query(`update public.leads set proxima_acao = $2 where id = $1`, [id, "x".repeat(121)]),
    ).rejects.toThrow(/leads_proxima_acao_tamanho/);
  });
});

describe("crm_0001 — histórico", () => {
  let db: PGlite;
  let id: string;

  const eventos = () =>
    db.query<{ tipo: string; de: string | null; para: string | null }>(
      `select tipo, de, para from public.lead_eventos where lead_id = $1 order by id`,
      [id],
    );

  beforeAll(async () => {
    db = await novoBanco();
    await db.exec(MIGRATION);
  });

  beforeEach(async () => {
    await limpar(db);
    id = await inserirLead(db);
  });

  it("registra mudança de status como de → para", async () => {
    await db.query(`update public.leads set status = 'contatado' where id = $1`, [id]);

    expect((await eventos()).rows).toEqual([
      { tipo: "status", de: "novo", para: "contatado" },
    ]);
  });

  it("NÃO copia anotação nem relato para o histórico", async () => {
    await db.query(
      `update public.leads set observacoes = 'segredo-sensivel-123' where id = $1`,
      [id],
    );

    expect((await eventos()).rows).toHaveLength(0);

    const tudo = await db.query(`select * from public.lead_eventos`);
    expect(JSON.stringify(tudo.rows)).not.toContain("segredo-sensivel-123");
  });

  it("registra retorno e não-contatar", async () => {
    await db.query(
      `update public.leads set proxima_acao_em = '2026-10-10T15:00:00Z' where id = $1`,
      [id],
    );
    await db.query(`update public.leads set nao_contatar_em = now() where id = $1`, [id]);
    await db.query(`update public.leads set nao_contatar_em = null where id = $1`, [id]);

    expect((await eventos()).rows).toEqual([
      { tipo: "retorno", de: null, para: "2026-10-10T15:00:00Z" },
      { tipo: "nao_contatar", de: null, para: "ativado" },
      { tipo: "nao_contatar", de: null, para: "removido" },
    ]);
  });

  it("um UPDATE sem mudança relevante não gera evento", async () => {
    await db.query(`update public.leads set status = 'novo' where id = $1`, [id]);

    expect((await eventos()).rows).toHaveLength(0);
  });
});

describe("crm_0001 — contador de login", () => {
  let db: PGlite;

  const falha = async (chave = CHAVE) =>
    (await db.query<{ s: number }>(`select public.crm_login_falha($1) as s`, [chave])).rows[0].s;
  const espera = async (chave = CHAVE) =>
    (await db.query<{ s: number }>(`select public.crm_login_espera($1) as s`, [chave])).rows[0].s;

  beforeAll(async () => {
    db = await novoBanco();
    await db.exec(MIGRATION);
  });

  beforeEach(async () => {
    await limpar(db);
  });

  it("três erros livres; do quarto em diante o bloqueio dobra até 15 min", async () => {
    expect(await espera()).toBe(0);

    expect([await falha(), await falha(), await falha()]).toEqual([0, 0, 0]);
    expect(await espera()).toBe(0);

    expect(await falha()).toBe(30);
    expect(await falha()).toBe(60);
    expect(await falha()).toBe(120);
    expect(await falha()).toBe(240);
    expect(await falha()).toBe(480);
    expect(await falha()).toBe(900);
    expect(await falha()).toBe(900);
  });

  it("depois do quarto erro, a origem aparece bloqueada", async () => {
    for (let i = 0; i < 4; i++) await falha();

    const s = await espera();
    expect(s).toBeGreaterThan(0);
    expect(s).toBeLessThanOrEqual(30);
  });

  it("origens diferentes não se afetam", async () => {
    for (let i = 0; i < 5; i++) await falha("b".repeat(32));

    expect(await espera("b".repeat(32))).toBeGreaterThan(0);
    expect(await espera("c".repeat(32))).toBe(0);
  });

  it("login correto zera o histórico da origem", async () => {
    for (let i = 0; i < 5; i++) await falha();
    await db.query(`select public.crm_login_ok($1)`, [CHAVE]);

    expect(await espera()).toBe(0);
    expect(await falha()).toBe(0);
  });

  it("a janela expira: erro antigo (>1h) não conta mais", async () => {
    for (let i = 0; i < 3; i++) await falha();
    await db.query(
      `update public.crm_login_tentativas set ultima_falha_em = now() - interval '2 hours'`,
    );

    // Recomeça em 1, então o 4º "erro" do histórico antigo NÃO bloqueia.
    expect(await falha()).toBe(0);
  });

  it("limpa registros parados há mais de um dia", async () => {
    await falha("d".repeat(32));
    await db.query(
      `update public.crm_login_tentativas set ultima_falha_em = now() - interval '2 days' where chave = $1`,
      ["d".repeat(32)],
    );

    await falha("e".repeat(32));

    const r = await db.query(`select chave from public.crm_login_tentativas`);
    expect(r.rows.map((l) => (l as { chave: string }).chave)).toEqual(["e".repeat(32)]);
  });

  it("recusa chave curta demais (nunca guardar lixo nem IP cru curto)", async () => {
    await expect(falha("curta")).rejects.toThrow(/chave inválida/);
  });
});

describe("crm_0001 — contagens", () => {
  let db: PGlite;

  beforeAll(async () => {
    db = await novoBanco();
    await db.exec(MIGRATION);
  });

  beforeEach(async () => {
    await limpar(db);
  });

  const contagens = async (fim: string) =>
    (await db.query<{ c: Record<string, unknown> }>(
      `select public.crm_contagens($1::timestamptz) as c`,
      [fim],
    )).rows[0].c;

  it("tabela vazia devolve zeros, sem erro", async () => {
    expect(await contagens("2026-10-10T23:59:59Z")).toEqual({
      total: 0,
      por_status: {},
      retornos: 0,
    });
  });

  it("conta TODA a tabela, não um recorte (600 leads)", async () => {
    await db.exec(`
      insert into public.leads (nome, whatsapp, email, idade, peso, consentimento_em, status)
      select 'L' || g, '(11) 91234-5678', 'l' || g || '@x.com', '18 a 21', 'Outro', now(),
             case when g % 3 = 0 then 'novo' when g % 3 = 1 then 'contatado' else 'perdido' end
      from generate_series(1, 600) g
    `);

    expect(await contagens("2026-10-10T23:59:59Z")).toEqual({
      total: 600,
      por_status: { novo: 200, contatado: 200, perdido: 200 },
      retornos: 0,
    });
  });

  it("retornos: vencidos até o fim do dia, só os que ainda estão em aberto", async () => {
    await db.exec(`
      insert into public.leads (nome, whatsapp, email, idade, peso, consentimento_em, status, proxima_acao_em) values
        ('a', '(11) 91234-5678', 'a@x.com', '18 a 21', 'Outro', now(), 'novo',      '2026-10-10T12:00:00Z'),
        ('b', '(11) 91234-5678', 'b@x.com', '18 a 21', 'Outro', now(), 'contatado', '2026-10-01T12:00:00Z'),
        ('c', '(11) 91234-5678', 'c@x.com', '18 a 21', 'Outro', now(), 'novo',      '2026-10-11T12:00:00Z'),
        ('d', '(11) 91234-5678', 'd@x.com', '18 a 21', 'Outro', now(), 'fechado',   '2026-10-01T12:00:00Z'),
        ('e', '(11) 91234-5678', 'e@x.com', '18 a 21', 'Outro', now(), 'novo',      null)
    `);

    const c = await contagens("2026-10-10T23:59:59Z");
    expect(c.retornos).toBe(2); // a e b; c é amanhã, d está fechado, e não tem retorno
  });
});

describe("crm_0001 — permissões", () => {
  let db: PGlite;

  beforeAll(async () => {
    db = await novoBanco();
    await db.exec(MIGRATION);
  });

  it.each(["lead_eventos", "crm_sessoes", "crm_login_tentativas"])(
    "chaves públicas não têm NENHUM privilégio em %s",
    async (tabela) => {
      for (const role of ["anon", "authenticated"]) {
        for (const priv of ["SELECT", "INSERT", "UPDATE", "DELETE"]) {
          const r = await db.query<{ ok: boolean }>(
            `select has_table_privilege($1, $2, $3) as ok`,
            [role, `public.${tabela}`, priv],
          );
          expect(r.rows[0].ok, `${role} ${priv} em ${tabela}`).toBe(false);
        }
      }
    },
  );

  it("service_role acessa as tabelas novas", async () => {
    for (const tabela of ["crm_sessoes", "crm_login_tentativas"]) {
      const r = await db.query<{ ok: boolean }>(
        `select has_table_privilege('service_role', $1, 'SELECT') as ok`,
        [`public.${tabela}`],
      );
      expect(r.rows[0].ok).toBe(true);
    }
  });

  it("anon NÃO executa as funções de login; service_role executa", async () => {
    for (const fn of [
      "crm_login_falha(text)",
      "crm_login_espera(text)",
      "crm_login_ok(text)",
      "crm_contagens(timestamptz)",
    ]) {
      const anon = await db.query<{ ok: boolean }>(
        `select has_function_privilege('anon', $1::regprocedure, 'EXECUTE') as ok`,
        [`public.${fn}`],
      );
      const servidor = await db.query<{ ok: boolean }>(
        `select has_function_privilege('service_role', $1::regprocedure, 'EXECUTE') as ok`,
        [`public.${fn}`],
      );
      expect(anon.rows[0].ok, `anon em ${fn}`).toBe(false);
      expect(servidor.rows[0].ok, `service_role em ${fn}`).toBe(true);
    }
  });

  it("tabelas novas com RLS ligado e nenhuma policy", async () => {
    const rls = await db.query<{ relname: string; relrowsecurity: boolean }>(
      `select relname, relrowsecurity from pg_class
       where relname in ('lead_eventos','crm_sessoes','crm_login_tentativas')`,
    );
    expect(rls.rows).toHaveLength(3);
    expect(rls.rows.every((l) => l.relrowsecurity)).toBe(true);

    const policies = await db.query(`select 1 from pg_policies where schemaname = 'public'`);
    expect(policies.rows).toHaveLength(0);
  });

  it("anon, de fato, leva 'permission denied' ao tentar ler uma tabela de sessão", async () => {
    await db.exec(`set role anon`);
    await expect(db.query(`select * from public.crm_sessoes`)).rejects.toThrow(/permission denied/);
    await db.exec(`reset role`);
  });
});

describe("crm_0001 — rollback", () => {
  it("remove o que o CRM criou e preserva colunas e linhas da LP", async () => {
    const db = await novoBanco();
    const id = await inserirLead(db);
    await db.exec(MIGRATION);
    await db.exec(ROLLBACK);

    const objetos = await db.query(
      `select relname from pg_class
       where relname in ('lead_eventos','crm_sessoes','crm_login_tentativas')`,
    );
    expect(objetos.rows).toHaveLength(0);

    const colunasCrm = await db.query(
      `select column_name from information_schema.columns
       where table_name = 'leads'
         and column_name in ('versao','atualizado_em','proxima_acao_em','proxima_acao','nao_contatar_em','whatsapp_digitos')`,
    );
    expect(colunasCrm.rows).toHaveLength(0);

    // A LP continua inteira.
    const lead = await db.query<{ nome: string; utm_source: string | null }>(
      `select nome, utm_source from public.leads where id = $1`,
      [id],
    );
    expect(lead.rows[0].nome).toBe("Ana Teste");

    // E dá pra aplicar de novo depois.
    await expect(db.exec(MIGRATION)).resolves.toBeDefined();
  });
});
