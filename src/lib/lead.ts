/**
 * Tipos, rótulos e leitura defensiva do lead — SEM `server-only`.
 *
 * Separado do acesso ao banco (repositorio.ts) de propósito: o seletor de
 * status e o campo de anotações são componentes de cliente e precisam dos
 * rótulos. Importar um módulo `server-only` no navegador quebra o build.
 */

import { mensagemWhatsapp } from "@/config/marca";

import { whatsappInternacional } from "./telefone";
import { ehUuid } from "./validacao";

export const statusLead = [
  "novo",
  "contatado",
  "call_marcada",
  "call_feita",
  "fechado",
  "perdido",
] as const;

export type StatusLead = (typeof statusLead)[number];

/**
 * "desconhecido" existe para o dado que o banco aceitou mas este código não
 * conhece (status novo criado fora daqui). Melhor mostrar "Desconhecido" do
 * que um selo em branco, ou derrubar a lista inteira por causa de uma linha.
 */
export type StatusExibido = StatusLead | "desconhecido";

export const rotuloStatus: Record<StatusExibido, string> = {
  novo: "Novo",
  contatado: "Contatado",
  call_marcada: "Call marcada",
  call_feita: "Call feita",
  fechado: "Fechado",
  perdido: "Perdido",
  desconhecido: "Desconhecido",
};

/**
 * Dourado = precisa de você. Verde = fechou. Apagado = encerrado.
 * Só tokens de texto com contraste medido (ver globals.css).
 */
export const corStatus: Record<StatusExibido, string> = {
  novo: "bg-dourado text-onyx",
  contatado: "bg-dourado/15 text-dourado border border-dourado/30",
  call_marcada: "bg-dourado/15 text-dourado border border-dourado/30",
  call_feita: "bg-marfim/10 text-texto border border-marfim/20",
  fechado: "bg-emerald-400/15 text-emerald-300 border border-emerald-400/30",
  perdido: "bg-marfim/5 text-texto-3 border border-marfim/15",
  desconhecido: "bg-marfim/5 text-texto-3 border border-marfim/15",
};

export function ehStatus(valor: unknown): valor is StatusLead {
  return typeof valor === "string" && statusLead.includes(valor as StatusLead);
}

/** Status em que o lead já não pede ação nenhuma. */
export function ehEncerrado(status: StatusExibido) {
  return status === "fechado" || status === "perdido";
}

export type ResumoLead = {
  id: string;
  criado_em: string;
  nome: string;
  idade: string;
  peso: string;
  status: StatusExibido;
  versao: number;
  proxima_acao_em: string | null;
  nao_contatar_em: string | null;
};

export type DetalheLead = ResumoLead & {
  whatsapp: string;
  email: string;
  contexto: string | null;
  consentimento_em: string | null;
  observacoes: string | null;
  proxima_acao: string | null;
  atualizado_em: string | null;
  confirmacao_responsavel: boolean;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
  referrer_host: string | null;
};

/** O que o formulário de edição controla — e o que o servidor devolve após salvar. */
export type CamposEditaveis = {
  versao: number;
  status: StatusExibido;
  observacoes: string | null;
  proxima_acao_em: string | null;
  proxima_acao: string | null;
  nao_contatar_em: string | null;
  atualizado_em: string | null;
};

export type Evento = {
  id: number;
  tipo: "status" | "retorno" | "nao_contatar";
  de: string | null;
  para: string | null;
  criado_em: string;
};

const texto = (v: unknown, padrao = ""): string => (typeof v === "string" ? v : padrao);
const textoOuNulo = (v: unknown): string | null => (typeof v === "string" ? v : null);

function statusSeguro(v: unknown): StatusExibido {
  return ehStatus(v) ? v : "desconhecido";
}

/**
 * Lê uma linha da lista. Devolve null só se a linha é inutilizável (sem id):
 * campo ausente ou de tipo errado vira valor neutro, nunca exceção — o banco é
 * compartilhado com a LP, e um cadastro legado não pode derrubar o painel.
 */
export function lerResumo(linha: unknown): ResumoLead | null {
  if (typeof linha !== "object" || linha === null) return null;

  const l = linha as Record<string, unknown>;
  if (!ehUuid(l.id)) return null;

  return {
    id: l.id,
    criado_em: texto(l.criado_em),
    nome: texto(l.nome).trim() || "(sem nome)",
    idade: texto(l.idade),
    peso: texto(l.peso),
    status: statusSeguro(l.status),
    versao: Number.isInteger(l.versao) && (l.versao as number) >= 1 ? (l.versao as number) : 1,
    proxima_acao_em: textoOuNulo(l.proxima_acao_em),
    nao_contatar_em: textoOuNulo(l.nao_contatar_em),
  };
}

export function lerDetalhe(linha: unknown): DetalheLead | null {
  const resumo = lerResumo(linha);
  if (!resumo) return null;

  const l = linha as Record<string, unknown>;

  return {
    ...resumo,
    whatsapp: texto(l.whatsapp),
    email: texto(l.email),
    contexto: textoOuNulo(l.contexto),
    consentimento_em: textoOuNulo(l.consentimento_em),
    observacoes: textoOuNulo(l.observacoes),
    proxima_acao: textoOuNulo(l.proxima_acao),
    atualizado_em: textoOuNulo(l.atualizado_em),
    confirmacao_responsavel: l.confirmacao_responsavel === true,
    utm_source: textoOuNulo(l.utm_source),
    utm_medium: textoOuNulo(l.utm_medium),
    utm_campaign: textoOuNulo(l.utm_campaign),
    utm_content: textoOuNulo(l.utm_content),
    utm_term: textoOuNulo(l.utm_term),
    referrer_host: textoOuNulo(l.referrer_host),
  };
}

export function lerEvento(linha: unknown): Evento | null {
  if (typeof linha !== "object" || linha === null) return null;

  const l = linha as Record<string, unknown>;
  const tipo = l.tipo;

  if (tipo !== "status" && tipo !== "retorno" && tipo !== "nao_contatar") return null;
  if (typeof l.id !== "number" || typeof l.criado_em !== "string") return null;

  return {
    id: l.id,
    tipo,
    de: textoOuNulo(l.de),
    para: textoOuNulo(l.para),
    criado_em: l.criado_em,
  };
}

export function camposEditaveis(lead: DetalheLead): CamposEditaveis {
  return {
    versao: lead.versao,
    status: lead.status,
    observacoes: lead.observacoes,
    proxima_acao_em: lead.proxima_acao_em,
    proxima_acao: lead.proxima_acao,
    nao_contatar_em: lead.nao_contatar_em,
    atualizado_em: lead.atualizado_em,
  };
}

/**
 * Faixas de idade gravadas pela LP. "16 a 18" é o valor ANTIGO e é ambíguo: mistura
 * menor e maior de idade. Não dá pra reclassificar olhando o texto, então ele
 * é mostrado como o que é, sem virar "menor" nem "adulto" por palpite.
 */
export function infoFaixa(idade: string): { menor: boolean; ambigua: boolean } {
  return {
    menor: idade === "16 a 17",
    ambigua: idade === "16 a 18",
  };
}

/** Link do WhatsApp com a primeira mensagem. Null se o número não for válido. */
export function linkWhatsapp(lead: Pick<ResumoLead, "nome"> & { whatsapp: string }): string | null {
  const destino = whatsappInternacional(lead.whatsapp);
  if (!destino) return null;

  const primeiroNome = lead.nome.trim().split(/\s+/)[0] || "tudo bem";

  return `https://wa.me/${destino}?text=${encodeURIComponent(mensagemWhatsapp(primeiroNome))}`;
}
