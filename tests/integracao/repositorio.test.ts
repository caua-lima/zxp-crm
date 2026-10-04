import { afterEach, describe, expect, it, vi } from "vitest";

import { decodificarCursor } from "@/lib/cursor";
import { ErroCrm } from "@/lib/erros";
import type { FiltroLista } from "@/lib/repositorio";
import { capturarConsole, pedidosAosLeads, prepararAmbiente } from "../helpers/ambiente";

const banco = prepararAmbiente();

afterEach(() => vi.restoreAllMocks());

async function comSessao() {
  const sessao = await import("@/lib/sessao");
  await sessao.abrirSessao();

  return import("@/lib/repositorio");
}

const sem = (parcial: Partial<FiltroLista> = {}): FiltroLista => ({
  status: null,
  busca: "",
  cursor: null,
  ...parcial,
});

/** Percorre TODAS as páginas e devolve os ids na ordem em que apareceram. */
async function percorrer(repo: Awaited<ReturnType<typeof comSessao>>, filtro: Partial<FiltroLista> = {}) {
  const ids: string[] = [];
  let cursor: FiltroLista["cursor"] = null;
  let paginas = 0;

  do {
    const pagina = await repo.listarLeads(sem({ ...filtro, cursor }));
    ids.push(...pagina.itens.map((l) => l.id));
    cursor = decodificarCursor(pagina.proximo);
    paginas++;
  } while (cursor && paginas < 100);

  return { ids, paginas };
}

/** n leads com criado_em distintos, do mais novo (índice 0) ao mais antigo. */
function semearEscalonados(n: number, parcial: (i: number) => Record<string, unknown> = () => ({})) {
  const base = Date.UTC(2026, 9, 1);

  return Array.from({ length: n }, (_, i) =>
    banco.semear({
      nome: `Lead ${String(i).padStart(4, "0")}`,
      criado_em: new Date(base - i * 60_000).toISOString(),
      ...parcial(i),
    }),
  );
}

describe("listagem: 0, 1, 500 e 501+ registros", () => {
  it("0 leads: lista vazia, sem próxima página", async () => {
    const repo = await comSessao();
    const pagina = await repo.listarLeads(sem());

    expect(pagina).toEqual({ itens: [], proximo: null, ignorados: 0 });
  });

  it("1 lead", async () => {
    banco.semear({ nome: "Única" });
    const repo = await comSessao();
    const pagina = await repo.listarLeads(sem());

    expect(pagina.itens.map((l) => l.nome)).toEqual(["Única"]);
    expect(pagina.proximo).toBeNull();
  });

  it("exatamente uma página cheia (25): não inventa próxima página", async () => {
    semearEscalonados(25);
    const repo = await comSessao();
    const pagina = await repo.listarLeads(sem());

    expect(pagina.itens).toHaveLength(25);
    expect(pagina.proximo).toBeNull();
  });

  it("501 leads: nada é cortado em silêncio — todas as páginas somam 501, sem repetir", async () => {
    semearEscalonados(501);
    const repo = await comSessao();

    const { ids, paginas } = await percorrer(repo);

    expect(ids).toHaveLength(501);
    expect(new Set(ids).size).toBe(501);
    expect(paginas).toBe(21); // 20 de 25 + 1 de 1
  });

  it("ordem: mais recentes primeiro", async () => {
    const leads = semearEscalonados(60);
    const repo = await comSessao();

    const { ids } = await percorrer(repo);

    expect(ids).toEqual(leads.map((l) => l.id));
  });

  it("o bug da auditoria: lead ANTIGO 'novo' além do 500º aparece no filtro e no contador", async () => {
    // 520 leads; só o mais antigo está 'novo' — o resto, 'contatado'.
    semearEscalonados(520, (i) => ({ status: i === 519 ? "novo" : "contatado" }));
    const repo = await comSessao();

    const novos = await repo.listarLeads(sem({ status: "novo" }));
    expect(novos.itens).toHaveLength(1);
    expect(novos.itens[0].nome).toBe("Lead 0519");

    // Antes: a aba mostrava ZERO novos (contava só os 500 mais recentes).
    const c = await repo.contagens();
    expect(c.porStatus.novo).toBe(1);
    expect(c.porStatus.contatado).toBe(519);
    expect(c.total).toBe(520);
  });
});

describe("paginação por cursor", () => {
  it("timestamps IGUAIS não duplicam nem pulam itens entre páginas", async () => {
    const mesmoInstante = "2026-10-01T12:00:00.000Z";
    const ids = Array.from({ length: 60 }, () => banco.semear({ criado_em: mesmoInstante }).id as string);
    const repo = await comSessao();

    const { ids: vistos, paginas } = await percorrer(repo);

    expect(paginas).toBe(3);
    expect(vistos).toHaveLength(60);
    expect(new Set(vistos)).toEqual(new Set(ids));
  });

  it("lead novo chegando no meio da navegação não repete item (offset repetiria)", async () => {
    semearEscalonados(40);
    const repo = await comSessao();

    const primeira = await repo.listarLeads(sem());

    // Chega um lead novo, mais recente que todos, ENTRE o clique na página 1 e na 2.
    banco.semear({ nome: "Chegou agora", criado_em: new Date(Date.UTC(2026, 9, 2)).toISOString() });

    const segunda = await repo.listarLeads(sem({ cursor: decodificarCursor(primeira.proximo) }));
    const todos = [...primeira.itens, ...segunda.itens].map((l) => l.id);

    expect(new Set(todos).size).toBe(todos.length);
    expect(segunda.itens.some((l) => l.nome === "Chegou agora")).toBe(false);
  });

  it("cursor adulterado na URL vira início da lista, nunca chega ao banco como filtro", async () => {
    expect(decodificarCursor("'; drop table leads;--")).toBeNull();
  });

  it("filtro por status + paginação", async () => {
    semearEscalonados(70, (i) => ({ status: i % 2 === 0 ? "novo" : "contatado" }));
    const repo = await comSessao();

    const { ids } = await percorrer(repo, { status: "novo" });

    expect(ids).toHaveLength(35);
  });

  it("'retornos': só os de hoje ou atrasados, em aberto, do mais urgente ao menos", async () => {
    const hoje = Date.now();
    const h = (horas: number) => new Date(hoje + horas * 3_600_000).toISOString();

    banco.semear({ nome: "Atrasado", status: "contatado", proxima_acao_em: h(-30) });
    banco.semear({ nome: "Hoje cedo", status: "call_marcada", proxima_acao_em: h(-1) });
    banco.semear({ nome: "Daqui a 3 dias", status: "contatado", proxima_acao_em: h(72) });
    banco.semear({ nome: "Fechado", status: "fechado", proxima_acao_em: h(-30) });
    banco.semear({ nome: "Sem retorno", status: "novo" });

    const repo = await comSessao();
    const pagina = await repo.listarLeads(sem({ status: "retornos" }));

    expect(pagina.itens.map((l) => l.nome)).toEqual(["Atrasado", "Hoje cedo"]);

    const c = await repo.contagens();
    expect(c.retornos).toBe(2);
  });
});

describe("busca", () => {
  async function achar(termo: string) {
    const repo = await comSessao();
    const pagina = await repo.listarLeads(sem({ busca: termo }));

    return pagina.itens.map((l) => l.nome);
  }

  it("por nome, sem diferenciar maiúscula", async () => {
    banco.semear({ nome: "Maria Souza" });
    banco.semear({ nome: "João Lima" });

    expect(await achar("souza")).toEqual(["Maria Souza"]);
    expect(await achar("MARIA")).toEqual(["Maria Souza"]);
  });

  it("por e-mail", async () => {
    banco.semear({ nome: "A", email: "maria@exemplo.com" });
    banco.semear({ nome: "B", email: "joao@exemplo.com" });

    expect(await achar("maria@")).toEqual(["A"]);
  });

  it("por telefone: com máscara, sem máscara ou só um pedaço", async () => {
    banco.semear({ nome: "A", whatsapp: "(11) 91234-5678" });
    banco.semear({ nome: "B", whatsapp: "(21) 98888-7777" });

    expect(await achar("(11) 91234-5678")).toEqual(["A"]);
    expect(await achar("11912345678")).toEqual(["A"]);
    expect(await achar("98888")).toEqual(["B"]);
    expect(await achar("+55 21 98888-7777")).toEqual(["B"]);
  });

  it("busca sem resultado devolve lista vazia, não erro", async () => {
    banco.semear({ nome: "Maria" });

    expect(await achar("zzzz")).toEqual([]);
  });

  it("busca + filtro de status + cursor compõem", async () => {
    semearEscalonados(60, (i) => ({
      nome: `Maria ${i}`,
      status: i % 2 === 0 ? "novo" : "contatado",
    }));
    const repo = await comSessao();

    const { ids } = await percorrer(repo, { busca: "maria", status: "novo" });

    expect(ids).toHaveLength(30);
  });

  it("INJEÇÃO DE FILTRO: o termo não consegue mudar a estrutura da consulta", async () => {
    banco.semear({ nome: "Fechado Um", status: "fechado" });
    banco.semear({ nome: "Novo Um", status: "novo" });
    const repo = await comSessao();

    // Tentativa clássica: fechar o ilike e acrescentar um filtro próprio.
    const ataque = 'x"),status.eq.fechado,nome.ilike.("';
    const pagina = await repo.listarLeads(sem({ status: "novo", busca: ataque }));

    // Sem o saneamento, o `or` viraria "...OR status=fechado" e vazaria o lead fechado.
    expect(pagina.itens.map((l) => l.nome)).not.toContain("Fechado Um");

    const consulta = decodeURIComponent(pedidosAosLeads(banco).at(-1)!.query);
    expect(consulta).not.toContain('"),status');
  });
});

describe("escrita atômica com controle de versão", () => {
  it("grava, sobe a versão e devolve o registro (a prova é o corpo, não o status HTTP)", async () => {
    const lead = banco.semear();
    const repo = await comSessao();

    const r = await repo.atualizarLead(lead.id as string, 1, { observacoes: "primeira" });

    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.lead.observacoes).toBe("primeira");
      expect(r.lead.versao).toBe(2);
    }
  });

  it("DUAS ABAS: a segunda recebe conflito, com o estado atual, e NÃO sobrescreve", async () => {
    const lead = banco.semear();
    const repo = await comSessao();

    const aba1 = await repo.atualizarLead(lead.id as string, 1, { observacoes: "aba 1" });
    const aba2 = await repo.atualizarLead(lead.id as string, 1, { observacoes: "aba 2" });

    expect(aba1.ok).toBe(true);
    expect(aba2).toMatchObject({ ok: false, motivo: "conflito" });

    if (!aba2.ok && aba2.motivo === "conflito") {
      expect(aba2.atual.observacoes).toBe("aba 1");
      expect(aba2.atual.versao).toBe(2);
    }

    expect(banco.leads[0].observacoes).toBe("aba 1");
  });

  it("id que não existe: nao_encontrado (e NUNCA 'salvo')", async () => {
    const repo = await comSessao();

    const r = await repo.atualizarLead("0a9c9026-d9b6-4397-a1e2-c81c9ad737ec", 1, { status: "contatado" });

    expect(r).toEqual({ ok: false, motivo: "nao_encontrado" });
  });

  it("204 SEM CORPO não é aceito como 'salvo' (o bug da auditoria)", async () => {
    const lead = banco.semear();
    banco.patchRespondeVazio = true;
    const repo = await comSessao();

    await expect(repo.atualizarLead(lead.id as string, 1, { observacoes: "x" })).rejects.toMatchObject({
      categoria: "upstream",
    });
  });

  it("mudar status gera evento de histórico; mudar anotação, não", async () => {
    const lead = banco.semear();
    const repo = await comSessao();

    await repo.atualizarLead(lead.id as string, 1, { observacoes: "sensível" });
    await repo.atualizarLead(lead.id as string, 2, { status: "contatado" });

    expect(banco.eventos).toHaveLength(1);
    expect(banco.eventos[0]).toMatchObject({ tipo: "status", de: "novo", para: "contatado" });
  });

  it("anotação em branco vira NULL", async () => {
    const lead = banco.semear({ observacoes: "antiga" });
    const repo = await comSessao();

    const r = await repo.atualizarLead(lead.id as string, 1, { observacoes: "   \n " });

    expect(r.ok && r.lead.observacoes).toBeNull();
  });

  it.each([
    ["id que não é UUID", () => ["nao-e-uuid", 1, { status: "novo" }] as const],
    ["versão zero", () => ["0a9c9026-d9b6-4397-a1e2-c81c9ad737ec", 0, { status: "novo" }] as const],
    ["versão fracionária", () => ["0a9c9026-d9b6-4397-a1e2-c81c9ad737ec", 1.5, { status: "novo" }] as const],
    ["status fora da lista", () => ["0a9c9026-d9b6-4397-a1e2-c81c9ad737ec", 1, { status: "hackeado" as never }] as const],
    ["anotação de 50.000 caracteres", () => ["0a9c9026-d9b6-4397-a1e2-c81c9ad737ec", 1, { observacoes: "x".repeat(50_000) }] as const],
    ["data inválida", () => ["0a9c9026-d9b6-4397-a1e2-c81c9ad737ec", 1, { proxima_acao_em: "amanhã" }] as const],
    ["sem nenhum campo", () => ["0a9c9026-d9b6-4397-a1e2-c81c9ad737ec", 1, {}] as const],
  ])("entrada inválida (%s) é recusada ANTES de chegar ao banco", async (_nome, args) => {
    const repo = await comSessao();
    const [id, versao, campos] = args();

    await expect(repo.atualizarLead(id, versao, campos)).rejects.toMatchObject({ categoria: "validacao" });
    expect(pedidosAosLeads(banco)).toHaveLength(0);
  });

  it("buscarLead com id que não é UUID não faz consulta nenhuma", async () => {
    const repo = await comSessao();

    expect(await repo.buscarLead("../../etc/passwd")).toBeNull();
    expect(pedidosAosLeads(banco)).toHaveLength(0);
  });
});

describe("dado legado", () => {
  it("campos opcionais ausentes e status desconhecido NÃO derrubam a lista", async () => {
    banco.semear({ nome: "Normal" });
    banco.semear({ nome: "Status novo", status: "arquivado" });
    banco.semear({ nome: "Sem contexto", contexto: null, email: "", observacoes: null });
    const repo = await comSessao();

    const pagina = await repo.listarLeads(sem());

    expect(pagina.itens).toHaveLength(3);
    expect(pagina.itens.find((l) => l.nome === "Status novo")?.status).toBe("desconhecido");
  });

  it("contagem separa status desconhecido em 'outros'", async () => {
    banco.semear({ status: "novo" });
    banco.semear({ status: "arquivado" });
    const repo = await comSessao();

    const c = await repo.contagens();

    expect(c.total).toBe(2);
    expect(c.porStatus.novo).toBe(1);
    expect(c.outros).toBe(1);
  });
});

describe("falhas do banco", () => {
  it("leitura com prazo estourado: repete UMA vez e depois classifica como timeout", async () => {
    banco.semear();
    const repo = await comSessao();
    banco.escopo = "/rest/v1/leads";
    banco.atrasoMs = 800; // o prazo dos testes é 300ms
    const antes = pedidosAosLeads(banco).length;

    await expect(repo.listarLeads(sem())).rejects.toMatchObject({ categoria: "timeout", incerto: false });

    // Leitura é repetida UMA vez: o pedido original + 1 tentativa.
    expect(pedidosAosLeads(banco).length - antes).toBe(2);
  });

  it("ESCRITA com prazo estourado: NÃO repete, e marca resultado INCERTO", async () => {
    const lead = banco.semear();
    const repo = await comSessao();
    banco.escopo = "/rest/v1/leads";
    banco.atrasoMs = 800;
    const antes = banco.pedidos.length;

    await expect(repo.atualizarLead(lead.id as string, 1, { observacoes: "x" })).rejects.toMatchObject({
      categoria: "timeout",
      incerto: true,
    });

    // exigirSessao consulta a sessão (1 pedido, também lento) e a escrita roda uma vez só.
    const escritas = banco.pedidos.slice(antes).filter((p) => p.metodo === "PATCH");
    expect(escritas.length).toBeLessThanOrEqual(1);
  });

  it("projeto pausado (521 do Cloudflare) vira 'indisponivel', sem expor HTML", async () => {
    const repo = await comSessao();
    banco.escopo = "/rpc/";
    banco.falha = { status: 521, corpo: "<html>Web server is down</html>" };

    const erro = await repo.contagens().catch((e) => e);

    expect(erro).toBeInstanceOf(ErroCrm);
    expect(erro.categoria).toBe("indisponivel");
    expect(erro.message).not.toContain("html");
  });

  it("conexão derrubada vira 'indisponivel'", async () => {
    const repo = await comSessao();
    banco.escopo = "/rpc/";
    banco.derrubarProximas = 2;

    await expect(repo.contagens()).rejects.toMatchObject({ categoria: "indisponivel" });
  });

  it("banco sem a migration: categoria 'schema_desatualizado' (não um erro genérico)", async () => {
    const repo = await comSessao();
    banco.schemaAntigo = true;

    await expect(repo.listarLeads(sem())).rejects.toMatchObject({ categoria: "schema_desatualizado" });
  });

  it("credencial do banco recusada (401) vira 'configuracao'", async () => {
    const repo = await comSessao();
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "sb_secret_outra-chave-que-o-banco-nao-conhece");

    // A própria validação da sessão já bate na recusa: falha fechada, e com o
    // diagnóstico certo (configuração), não "sessão expirada".
    await expect(repo.contagens()).rejects.toMatchObject({ categoria: "configuracao" });
  });

  it("LOGS: corpo de erro do banco com dado pessoal NÃO vai para o log nem para a mensagem", async () => {
    const repo = await comSessao();
    const consola = capturarConsole();

    banco.escopo = "/rpc/";
    banco.falha = {
      status: 500,
      corpo: JSON.stringify({
        code: "23505",
        message: "duplicate key value violates unique constraint",
        details: "Key (whatsapp)=((11) 91234-5678) already exists.",
        hint: "Maria Silva SEGREDO-PII-123 maria@exemplo.com",
      }),
    };

    const erro = await repo.contagens().catch((e) => e);
    consola.parar();

    const log = consola.texto();

    expect(log).toContain("banco.erro");
    expect(log).toContain("23505"); // o CÓDIGO ajuda a diagnosticar e não é dado pessoal
    for (const marcador of ["SEGREDO-PII-123", "Maria Silva", "maria@exemplo.com", "91234-5678"]) {
      expect(log).not.toContain(marcador);
      expect(erro.message).not.toContain(marcador);
    }
  });
});
