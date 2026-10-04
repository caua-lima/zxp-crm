import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

/**
 * Banco SIMULADO: um servidor HTTP que fala o subconjunto de PostgREST que o
 * painel usa. Serve para testar o painel de ponta a ponta SEM tocar no banco
 * real (que guarda dados de pessoas de verdade) e sem credencial nenhuma.
 *
 * Isto é uma simulação, e o que ela NÃO prova precisa ficar dito:
 *  - não prova que o PostgREST/Supabase real entende as mesmas consultas (a
 *    sintaxe foi conferida na documentação oficial do PostgREST);
 *  - não prova o SQL: gatilhos, funções e permissões são testados à parte,
 *    num Postgres de verdade (tests/db/migracao.test.ts);
 *  - não prova RLS nem grants do banco publicado (supabase/verificacao/inspecao.sql).
 * A lógica de versão/eventos/login aqui espelha a migration crm_0001.
 */

type Linha = Record<string, unknown>;

export type PedidoRegistrado = {
  metodo: string;
  caminho: string;
  query: string;
  corpo?: unknown;
};

const RESERVADAS = new Set(["select", "order", "limit", "offset", "on_conflict", "columns"]);
const EDITAVEIS = ["status", "observacoes", "proxima_acao_em", "proxima_acao", "nao_contatar_em"];

// ── Filtros PostgREST ────────────────────────────────────────────────────

type No =
  | { tipo: "cond"; col: string; op: string; valor: string; nega: boolean }
  | { tipo: "logico"; op: "and" | "or"; nos: No[]; nega: boolean };

/** Divide por vírgulas de nível zero, respeitando parênteses e aspas. */
function dividir(texto: string): string[] {
  const partes: string[] = [];
  let nivel = 0;
  let aspas = false;
  let atual = "";

  for (const ch of texto) {
    if (ch === '"') aspas = !aspas;
    if (!aspas && ch === "(") nivel++;
    if (!aspas && ch === ")") nivel--;

    if (!aspas && nivel === 0 && ch === ",") {
      partes.push(atual);
      atual = "";
    } else {
      atual += ch;
    }
  }

  if (atual) partes.push(atual);

  return partes;
}

function desaspar(valor: string) {
  return valor.startsWith('"') && valor.endsWith('"') ? valor.slice(1, -1) : valor;
}

function lerNo(texto: string): No {
  const logico = /^(not\.)?(and|or)\(([\s\S]*)\)$/.exec(texto);

  if (logico) {
    return {
      tipo: "logico",
      op: logico[2] as "and" | "or",
      nega: Boolean(logico[1]),
      nos: dividir(logico[3]).map(lerNo),
    };
  }

  const i = texto.indexOf(".");
  const col = texto.slice(0, i);

  return lerCondicao(col, texto.slice(i + 1));
}

function lerCondicao(col: string, resto: string): No {
  let nega = false;

  if (resto.startsWith("not.")) {
    nega = true;
    resto = resto.slice(4);
  }

  const i = resto.indexOf(".");

  return { tipo: "cond", col, op: resto.slice(0, i), valor: desaspar(resto.slice(i + 1)), nega };
}

const ehIso = (v: unknown): v is string =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(v);

function comparar(a: unknown, b: string): number {
  if (ehIso(a) && ehIso(b)) return new Date(a).getTime() - new Date(b).getTime();
  if (typeof a === "number") return a - Number(b);

  const x = String(a);

  return x < b ? -1 : x > b ? 1 : 0;
}

function avaliar(linha: Linha, no: No): boolean {
  let resultado: boolean;

  if (no.tipo === "logico") {
    resultado =
      no.op === "and"
        ? no.nos.every((n) => avaliar(linha, n))
        : no.nos.some((n) => avaliar(linha, n));
  } else {
    const v = linha[no.col];

    switch (no.op) {
      case "eq":
        resultado = v !== null && v !== undefined && comparar(v, no.valor) === 0;
        break;
      case "neq":
        resultado = v === null || v === undefined || comparar(v, no.valor) !== 0;
        break;
      case "lt":
        resultado = v != null && comparar(v, no.valor) < 0;
        break;
      case "lte":
        resultado = v != null && comparar(v, no.valor) <= 0;
        break;
      case "gt":
        resultado = v != null && comparar(v, no.valor) > 0;
        break;
      case "gte":
        resultado = v != null && comparar(v, no.valor) >= 0;
        break;
      case "is":
        resultado = no.valor === "null" ? v === null || v === undefined : false;
        break;
      case "in": {
        const lista = dividir(no.valor.replace(/^\(|\)$/g, "")).map(desaspar);
        resultado = lista.includes(String(v));
        break;
      }
      case "ilike": {
        const padrao = no.valor
          .replace(/[.+^${}()|[\]\\]/g, "\\$&")
          .replace(/\*/g, ".*")
          .replace(/_/g, ".");
        resultado = v != null && new RegExp(`^${padrao}$`, "i").test(String(v));
        break;
      }
      default:
        throw new Error(`operador não suportado pelo banco simulado: ${no.op}`);
    }
  }

  return no.nega ? !resultado : resultado;
}

function filtrar(linhas: Linha[], params: URLSearchParams): Linha[] {
  const nos: No[] = [];

  for (const [chave, valor] of params) {
    if (RESERVADAS.has(chave)) continue;

    if (chave === "and" || chave === "or") {
      nos.push(lerNo(`${chave}${valor}`));
    } else {
      nos.push(lerCondicao(chave, valor));
    }
  }

  return linhas.filter((l) => nos.every((n) => avaliar(l, n)));
}

function ordenar(linhas: Linha[], order: string | null): Linha[] {
  if (!order) return linhas;

  const criterios = order.split(",").map((c) => {
    const [col, dir] = c.split(".");

    return { col, mult: dir === "desc" ? -1 : 1 };
  });

  return [...linhas].sort((a, b) => {
    for (const { col, mult } of criterios) {
      const x = a[col];
      const y = b[col];

      if (x === y) continue;
      if (x == null) return 1 * mult;
      if (y == null) return -1 * mult;

      const c = ehIso(x) && ehIso(y) ? new Date(x).getTime() - new Date(y).getTime() : x < y ? -1 : 1;
      if (c !== 0) return c * mult;
    }

    return 0;
  });
}

// ── O servidor ───────────────────────────────────────────────────────────

export class FakeSupabase {
  leads: Linha[] = [];
  eventos: Linha[] = [];
  sessoes: Linha[] = [];
  tentativas: Linha[] = [];
  pedidos: PedidoRegistrado[] = [];

  /** Atraso artificial antes de responder (para testar prazo). */
  atrasoMs = 0;
  /** Se definido, TODA resposta sai com este status e corpo (ex.: 521 = projeto pausado). */
  falha: { status: number; corpo?: string } | null = null;
  /** Simula banco sem a migration: consultas que citam colunas novas dão 42703. */
  schemaAntigo = false;
  /**
   * Restringe falha, atraso e queda de conexão a pedidos cujo caminho contém este
   * texto (ex.: "/rest/v1/leads"). Sem isso, derrubar o banco também derruba a
   * validação de sessão — que é o comportamento certo, mas não é o que o teste
   * de "a escrita falhou" quer exercitar.
   */
  escopo: string | null = null;
  /** PATCH responde 204 sem corpo mesmo pedindo representação (o falso "salvo" da auditoria). */
  patchRespondeVazio = false;
  /** Quantas vezes derrubar a conexão antes de voltar a responder. */
  derrubarProximas = 0;

  private servidor: Server | null = null;
  private contadorEvento = 1;

  readonly chave: string;

  // Campo explícito (e não `constructor(readonly chave)`): o scripts/banco-simulado.mjs
  // roda este arquivo direto no Node, que só REMOVE tipos e não suporta essa sintaxe.
  constructor(chave: string) {
    this.chave = chave;
  }

  async iniciar(porta = 0): Promise<string> {
    this.servidor = createServer((req, res) => {
      void this.tratar(req, res);
    });

    await new Promise<void>((ok) => this.servidor!.listen(porta, "127.0.0.1", ok));

    return `http://127.0.0.1:${(this.servidor.address() as AddressInfo).port}`;
  }

  async parar() {
    await new Promise<void>((ok) => {
      this.servidor?.closeAllConnections();
      this.servidor?.close(() => ok());
    });
  }

  reiniciar() {
    this.leads = [];
    this.eventos = [];
    this.sessoes = [];
    this.tentativas = [];
    this.pedidos = [];
    this.atrasoMs = 0;
    this.falha = null;
    this.schemaAntigo = false;
    this.derrubarProximas = 0;
    this.patchRespondeVazio = false;
    this.escopo = null;
  }

  /** Insere um lead com os padrões que o banco aplicaria. */
  semear(parcial: Partial<Linha> = {}): Linha {
    const lead: Linha = {
      id: randomUUID(),
      criado_em: new Date().toISOString(),
      nome: "Ana Teste",
      whatsapp: "(11) 91234-5678",
      email: "ana@exemplo.com",
      idade: "18 a 21",
      peso: "Outro",
      contexto: null,
      consentimento_em: new Date().toISOString(),
      confirmacao_responsavel: false,
      status: "novo",
      observacoes: null,
      versao: 1,
      atualizado_em: null,
      proxima_acao_em: null,
      proxima_acao: null,
      nao_contatar_em: null,
      utm_source: null,
      utm_medium: null,
      utm_campaign: null,
      utm_content: null,
      utm_term: null,
      referrer_host: null,
      ...parcial,
    };

    lead.whatsapp_digitos = String(lead.whatsapp).replace(/\D/g, "");
    this.leads.push(lead);

    return lead;
  }

  private async tratar(req: IncomingMessage, res: ServerResponse) {
    const url = new URL(req.url ?? "/", "http://fake");
    const corpoBruto = await new Promise<string>((ok) => {
      let dados = "";
      req.on("data", (c) => (dados += c));
      req.on("end", () => ok(dados));
    });
    const corpo = corpoBruto ? JSON.parse(corpoBruto) : undefined;

    this.pedidos.push({
      metodo: req.method ?? "",
      caminho: url.pathname,
      query: url.search,
      corpo,
    });

    const afeta = !this.escopo || url.pathname.includes(this.escopo);

    if (afeta && this.derrubarProximas > 0) {
      this.derrubarProximas--;
      req.socket.destroy();

      return;
    }

    if (afeta && this.atrasoMs > 0) await new Promise((r) => setTimeout(r, this.atrasoMs));

    const responder = (status: number, dados?: unknown, cabecalhos: Record<string, string> = {}) => {
      if (res.destroyed) return;

      res.writeHead(status, { "Content-Type": "application/json", ...cabecalhos });
      res.end(dados === undefined ? undefined : typeof dados === "string" ? dados : JSON.stringify(dados));
    };

    if (afeta && this.falha) {
      return responder(this.falha.status, this.falha.corpo ?? "", {
        "Content-Type": this.falha.corpo?.startsWith("<") ? "text/html" : "application/json",
      });
    }

    const auth = req.headers.authorization;
    if (req.headers.apikey !== this.chave || auth !== `Bearer ${this.chave}`) {
      return responder(401, { code: "PGRST301", message: "JWT inválido" });
    }

    try {
      this.rotear(req.method ?? "GET", url, corpo, String(req.headers.prefer ?? ""), responder);
    } catch (erro) {
      responder(500, { code: "XX000", message: String(erro) });
    }
  }

  private rotear(
    metodo: string,
    url: URL,
    corpo: unknown,
    preferir: string,
    responder: (s: number, d?: unknown, c?: Record<string, string>) => void,
  ) {
    const caminho = url.pathname.replace(/^\/rest\/v1\//, "");
    const params = url.searchParams;

    if (caminho.startsWith("rpc/")) {
      return this.rpc(caminho.slice(4), (corpo ?? {}) as Linha, responder);
    }

    const tabelas: Record<string, Linha[]> = {
      leads: this.leads,
      lead_eventos: this.eventos,
      crm_sessoes: this.sessoes,
    };
    const tabela = tabelas[caminho];

    if (!tabela) return responder(404, { code: "PGRST205", message: "tabela não existe" });

    const select = params.get("select");

    if (this.schemaAntigo && caminho === "leads") {
      const citaNova =
        (select ?? "").includes("versao") ||
        params.has("versao") ||
        (corpo && typeof corpo === "object" && "versao" in (corpo as Linha));

      if (citaNova) return responder(400, { code: "42703", message: "coluna não existe" });
    }

    const projetar = (l: Linha) => {
      if (!select || select.includes("*")) return l;

      return Object.fromEntries(select.split(",").map((c) => [c, l[c] ?? null]));
    };

    if (metodo === "GET") {
      let linhas = ordenar(filtrar(tabela, params), params.get("order"));
      const limite = params.get("limit");
      if (limite) linhas = linhas.slice(0, Number(limite));

      return responder(200, linhas.map(projetar));
    }

    if (metodo === "POST") {
      const novo = { criada_em: new Date().toISOString(), revogada_em: null, ...(corpo as Linha) };
      tabela.push(novo);

      return responder(201);
    }

    if (metodo === "DELETE") {
      const alvo = new Set(filtrar(tabela, params));
      const restantes = tabela.filter((l) => !alvo.has(l));
      tabela.length = 0;
      tabela.push(...restantes);

      return responder(204);
    }

    if (metodo === "PATCH") {
      if (this.patchRespondeVazio) return responder(204);

      const alvo = filtrar(tabela, params);

      for (const linha of alvo) {
        if (caminho === "leads") this.atualizarLead(linha, corpo as Linha);
        else Object.assign(linha, corpo);
      }

      return preferir.includes("return=representation")
        ? responder(200, alvo.map(projetar))
        : responder(204);
    }

    return responder(405);
  }

  /** Espelha crm_leads_antes_update / crm_leads_depois_update (migration crm_0001). */
  private atualizarLead(linha: Linha, alteracoes: Linha) {
    const antes = { ...linha };

    for (const [chave, valor] of Object.entries(alteracoes)) {
      // `versao` enviada pelo cliente é ignorada: quem manda é o banco.
      if (chave === "versao") continue;
      linha[chave] = valor;
    }

    const mudou = EDITAVEIS.some((c) => (linha[c] ?? null) !== (antes[c] ?? null));

    if (mudou) {
      linha.versao = (antes.versao as number) + 1;
      linha.atualizado_em = new Date().toISOString();
    }

    const evento = (tipo: string, de: unknown, para: unknown) =>
      this.eventos.push({
        id: this.contadorEvento++,
        lead_id: linha.id,
        tipo,
        de: de ?? null,
        para: para ?? null,
        criado_em: new Date().toISOString(),
      });

    if (linha.status !== antes.status) evento("status", antes.status, linha.status);
    if ((linha.proxima_acao_em ?? null) !== (antes.proxima_acao_em ?? null)) {
      evento("retorno", antes.proxima_acao_em, linha.proxima_acao_em);
    }
    if ((linha.nao_contatar_em == null) !== (antes.nao_contatar_em == null)) {
      evento("nao_contatar", null, linha.nao_contatar_em == null ? "removido" : "ativado");
    }
  }

  private rpc(
    nome: string,
    args: Linha,
    responder: (s: number, d?: unknown, c?: Record<string, string>) => void,
  ) {
    const agora = Date.now();

    if (nome === "crm_login_espera") {
      const t = this.tentativas.find((x) => x.chave === args.p_chave);
      const ate = t?.bloqueado_ate ? new Date(t.bloqueado_ate as string).getTime() : 0;

      return responder(200, ate > agora ? Math.ceil((ate - agora) / 1000) : 0);
    }

    if (nome === "crm_login_falha") {
      const chave = String(args.p_chave ?? "");
      if (chave.length < 16 || chave.length > 128) {
        return responder(400, { code: "P0001", message: "chave inválida" });
      }

      let t = this.tentativas.find((x) => x.chave === chave);

      if (!t) {
        t = { chave, falhas: 0, ultima_falha_em: new Date(agora).toISOString(), bloqueado_ate: null };
        this.tentativas.push(t);
      }

      const velha = agora - new Date(t.ultima_falha_em as string).getTime() > 3_600_000;
      t.falhas = velha ? 1 : (t.falhas as number) + 1;
      t.ultima_falha_em = new Date(agora).toISOString();

      const espera =
        (t.falhas as number) > 3
          ? Math.min(30 * 2 ** Math.min((t.falhas as number) - 4, 5), 900)
          : 0;
      t.bloqueado_ate = espera > 0 ? new Date(agora + espera * 1000).toISOString() : null;

      return responder(200, espera);
    }

    if (nome === "crm_login_ok") {
      this.tentativas = this.tentativas.filter((x) => x.chave !== args.p_chave);

      return responder(204);
    }

    if (nome === "crm_contagens") {
      const fim = new Date(String(args.p_fim_hoje)).getTime();
      const porStatus: Record<string, number> = {};

      for (const l of this.leads) {
        const s = String(l.status);
        porStatus[s] = (porStatus[s] ?? 0) + 1;
      }

      const retornos = this.leads.filter(
        (l) =>
          l.proxima_acao_em &&
          new Date(l.proxima_acao_em as string).getTime() <= fim &&
          !["fechado", "perdido"].includes(String(l.status)),
      ).length;

      return responder(200, { total: this.leads.length, por_status: porStatus, retornos });
    }

    return responder(404, { code: "PGRST202", message: "função não existe" });
  }
}
