import "server-only";

import { exigirSessao } from "./auth";
import { bancoFetch, lerJson, rpc } from "./banco";
import { codificarCursor, type Cursor } from "./cursor";
import { ErroCrm } from "./erros";
import {
  ehStatus,
  lerDetalhe,
  lerEvento,
  lerResumo,
  statusLead,
  type DetalheLead,
  type Evento,
  type ResumoLead,
  type StatusLead,
} from "./lead";
import { registrar } from "./log";
import { fimDoDiaSaoPaulo } from "./tempo";
import {
  digitosDeBusca,
  ehTimestampIso,
  ehUuid,
  ehVersao,
  normalizarObservacoes,
  sanitizarBusca,
  validarObservacoes,
  validarProximaAcao,
} from "./validacao";

/**
 * Acesso à tabela `leads` do Supabase.
 *
 * A chave usada é a service_role, que só existe no servidor. A tabela tem RLS
 * ligado e nenhuma policy, então nenhuma chave pública lê nada. Mas RLS não
 * protege daqui: a service_role contorna RLS por desenho. Quem protege é
 * `exigirSessao()`, chamado em TODA função exportada abaixo, antes de qualquer
 * acesso ao banco.
 */

export const TAMANHO_PAGINA = 25;

const COLUNAS_RESUMO =
  "id,criado_em,nome,idade,peso,status,versao,proxima_acao_em,nao_contatar_em";

// A lista não precisa de telefone, e-mail, relato nem anotações: só o detalhe
// busca isso. Menos dado trafegando entre servidor e banco, e menos exposto se
// algum dia uma lista for serializada por engano.
const COLUNAS_DETALHE =
  COLUNAS_RESUMO +
  ",whatsapp,email,contexto,consentimento_em,observacoes,proxima_acao,atualizado_em," +
  "confirmacao_responsavel,utm_source,utm_medium,utm_campaign,utm_content,utm_term,referrer_host";

/** `retornos` não é um status: é "tem retorno combinado até hoje e ainda está em aberto". */
export type FiltroStatus = StatusLead | "retornos" | null;

export type FiltroLista = {
  status: FiltroStatus;
  /** Já sanitizado (ver sanitizarBusca). Vazio = sem busca. */
  busca: string;
  cursor: Cursor | null;
};

export type PaginaLeads = {
  itens: ResumoLead[];
  /** Cursor da próxima página, ou null se esta é a última. */
  proximo: string | null;
  /** Linhas que o banco devolveu mas não deram para ler (sem id válido). */
  ignorados: number;
};

/** Query string com valores codificados (espaço = %20 e + = %2B; `+` solto viraria espaço). */
function qs(pares: Array<[string, string]>): string {
  return pares.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&");
}

/** Valor entre aspas dentro de uma expressão lógica do PostgREST. */
const q = (valor: string) => `"${valor}"`;

function condicaoDeBusca(busca: string): string | null {
  const termo = sanitizarBusca(busca);
  if (!termo) return null;

  const clausulas = [`nome.ilike.${q(`*${termo}*`)}`, `email.ilike.${q(`*${termo}*`)}`];

  const digitos = digitosDeBusca(termo);
  if (digitos) clausulas.push(`whatsapp_digitos.ilike.${q(`*${digitos}*`)}`);

  return `or(${clausulas.join(",")})`;
}

/**
 * Uma página de leads.
 *
 * Paginação por CURSOR (posição = valor de ordenação + id), não por offset:
 * com leads novos chegando, offset repete ou pula itens; cursor não. O id
 * desempata timestamps iguais, então nenhum item some entre páginas.
 */
export async function listarLeads(
  filtro: FiltroLista,
  limite: number = TAMANHO_PAGINA,
): Promise<PaginaLeads> {
  await exigirSessao();

  const retornos = filtro.status === "retornos";
  const campo = retornos ? "proxima_acao_em" : "criado_em";
  const direcao = retornos ? "asc" : "desc";

  const pares: Array<[string, string]> = [
    ["select", COLUNAS_RESUMO],
    ["order", `${campo}.${direcao},id.${direcao}`],
    // Uma a mais só para saber se existe próxima página.
    ["limit", String(limite + 1)],
  ];

  if (ehStatus(filtro.status)) pares.push(["status", `eq.${filtro.status}`]);

  if (retornos) {
    pares.push(["proxima_acao_em", `lte.${fimDoDiaSaoPaulo()}`]);
    pares.push(["status", "not.in.(fechado,perdido)"]);
  }

  const condicoes: string[] = [];

  if (filtro.cursor) {
    const op = direcao === "desc" ? "lt" : "gt";
    const { c, i } = filtro.cursor;

    condicoes.push(
      `or(${campo}.${op}.${q(c)},and(${campo}.eq.${q(c)},id.${op}.${q(i)}))`,
    );
  }

  const busca = condicaoDeBusca(filtro.busca);
  if (busca) condicoes.push(busca);

  if (condicoes.length > 0) pares.push(["and", `(${condicoes.join(",")})`]);

  const resposta = await bancoFetch("lead.listar", `leads?${qs(pares)}`);
  const linhas = await lerJson<unknown>(resposta, "lead.listar");

  if (!Array.isArray(linhas)) throw new ErroCrm("upstream", "lead.listar");

  const lidos = linhas.map(lerResumo);
  const validos = lidos.filter((l): l is ResumoLead => l !== null);
  const ignorados = lidos.length - validos.length;

  if (ignorados > 0) registrar("warn", "lead.linhas_ignoradas", { quantidade: ignorados });

  const haMais = validos.length > limite;
  const itens = validos.slice(0, limite);
  const ultimo = itens[itens.length - 1];
  const valorCursor = ultimo ? (retornos ? ultimo.proxima_acao_em : ultimo.criado_em) : null;

  return {
    itens,
    proximo:
      haMais && ultimo && ehTimestampIso(valorCursor)
        ? codificarCursor({ c: valorCursor, i: ultimo.id })
        : null,
    ignorados,
  };
}

export type Contagens = {
  total: number;
  retornos: number;
  porStatus: Record<StatusLead, number>;
  /** Leads com um status que este código não conhece. */
  outros: number;
};

const numero = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : 0);

/** Totais de TODA a tabela (não do recorte exibido). */
export async function contagens(): Promise<Contagens> {
  await exigirSessao();

  const dados = await rpc<unknown>("crm_contagens", { p_fim_hoje: fimDoDiaSaoPaulo() });

  if (typeof dados !== "object" || dados === null) {
    throw new ErroCrm("upstream", "rpc.crm_contagens");
  }

  const d = dados as Record<string, unknown>;
  const bruto =
    typeof d.por_status === "object" && d.por_status !== null
      ? (d.por_status as Record<string, unknown>)
      : {};

  const porStatus = Object.fromEntries(
    statusLead.map((s) => [s, numero(bruto[s])]),
  ) as Record<StatusLead, number>;

  const conhecidos = Object.values(porStatus).reduce((a, b) => a + b, 0);
  const total = numero(d.total);

  return {
    total,
    retornos: numero(d.retornos),
    porStatus,
    outros: Math.max(0, total - conhecidos),
  };
}

async function lerLead(id: string): Promise<DetalheLead | null> {
  const resposta = await bancoFetch(
    "lead.buscar",
    `leads?${qs([
      ["select", COLUNAS_DETALHE],
      ["id", `eq.${id}`],
      ["limit", "1"],
    ])}`,
  );
  const linhas = await lerJson<unknown>(resposta, "lead.buscar");

  if (!Array.isArray(linhas) || linhas.length === 0) return null;

  return lerDetalhe(linhas[0]);
}

export async function buscarLead(id: string): Promise<DetalheLead | null> {
  await exigirSessao();

  // Id que não é UUID nem chega ao banco.
  if (!ehUuid(id)) return null;

  return lerLead(id);
}

/** Histórico curto do lead. Não é essencial: se falhar, a página abre sem ele. */
export async function listarEventos(id: string, limite = 15): Promise<Evento[]> {
  await exigirSessao();

  if (!ehUuid(id)) return [];

  try {
    const resposta = await bancoFetch(
      "lead.eventos",
      `lead_eventos?${qs([
        ["select", "id,tipo,de,para,criado_em"],
        ["lead_id", `eq.${id}`],
        ["order", "criado_em.desc,id.desc"],
        ["limit", String(limite)],
      ])}`,
    );
    const linhas = await lerJson<unknown>(resposta, "lead.eventos");

    return Array.isArray(linhas)
      ? linhas.map(lerEvento).filter((e): e is Evento => e !== null)
      : [];
  } catch (erro) {
    if (!(erro instanceof ErroCrm)) throw erro;

    return [];
  }
}

export type CamposAtualizacao = {
  status?: StatusLead;
  observacoes?: string | null;
  proxima_acao_em?: string | null;
  proxima_acao?: string | null;
  nao_contatar_em?: string | null;
};

export type ResultadoEscrita =
  | { ok: true; lead: DetalheLead }
  | { ok: false; motivo: "conflito"; atual: DetalheLead }
  | { ok: false; motivo: "nao_encontrado" };

/** Valida e monta o corpo do PATCH. Só campos permitidos, com tipo e tamanho conferidos. */
export function montarCorpo(campos: CamposAtualizacao): Record<string, string | null> {
  const corpo: Record<string, string | null> = {};
  const invalido = () => new ErroCrm("validacao", "lead.atualizar");

  if ("status" in campos) {
    if (!ehStatus(campos.status)) throw invalido();
    corpo.status = campos.status;
  }

  if ("observacoes" in campos) {
    const texto = campos.observacoes ?? "";
    if (validarObservacoes(texto) !== null) throw invalido();
    corpo.observacoes = normalizarObservacoes(texto);
  }

  if ("proxima_acao" in campos) {
    const texto = (campos.proxima_acao ?? "").trim();
    if (validarProximaAcao(texto) !== null) throw invalido();
    corpo.proxima_acao = texto === "" ? null : texto;
  }

  for (const chave of ["proxima_acao_em", "nao_contatar_em"] as const) {
    if (chave in campos) {
      const valor = campos[chave];
      if (valor !== null && !ehTimestampIso(valor)) throw invalido();
      corpo[chave] = valor ?? null;
    }
  }

  if (Object.keys(corpo).length === 0) throw invalido();

  return corpo;
}

/**
 * Atualiza um lead SE a versão ainda for a que a tela leu.
 *
 * É uma única instrução atômica (`WHERE id AND versao`), não "ler e depois
 * gravar". Três saídas, nunca confundidas:
 *  - uma linha devolvida  → gravou (o corpo da resposta é a prova, não o status HTTP);
 *  - zero linhas e o lead existe → CONFLITO: alguém alterou antes. Devolve o
 *    estado atual para a tela comparar, sem sobrescrever nada;
 *  - zero linhas e o lead não existe → não encontrado.
 * Um 204 sem corpo NÃO é aceito como "salvo".
 */
export async function atualizarLead(
  id: string,
  versaoEsperada: number,
  campos: CamposAtualizacao,
): Promise<ResultadoEscrita> {
  await exigirSessao();

  if (!ehUuid(id) || !ehVersao(versaoEsperada)) {
    throw new ErroCrm("validacao", "lead.atualizar");
  }

  const corpo = montarCorpo(campos);

  const resposta = await bancoFetch(
    "lead.atualizar",
    `leads?${qs([
      ["id", `eq.${id}`],
      ["versao", `eq.${versaoEsperada}`],
      ["select", COLUNAS_DETALHE],
    ])}`,
    { metodo: "PATCH", preferir: "return=representation", corpo },
  );

  const linhas = await lerJson<unknown>(resposta, "lead.atualizar");
  if (!Array.isArray(linhas)) throw new ErroCrm("upstream", "lead.atualizar");

  if (linhas.length > 1) {
    // `id` é chave primária: mais de uma linha atualizada seria um defeito grave.
    registrar("error", "lead.atualizacao_multipla", { linhas: linhas.length });
    throw new ErroCrm("upstream", "lead.atualizar");
  }

  if (linhas.length === 1) {
    const lead = lerDetalhe(linhas[0]);
    if (!lead) throw new ErroCrm("upstream", "lead.atualizar");

    return { ok: true, lead };
  }

  const atual = await lerLead(id);

  return atual ? { ok: false, motivo: "conflito", atual } : { ok: false, motivo: "nao_encontrado" };
}
