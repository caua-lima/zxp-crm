/**
 * Tipos e constantes do lead — SEM `server-only`.
 *
 * Esta separação é deliberada: o seletor de status e o campo de observações
 * são componentes de cliente e precisam dos rótulos. Se isso morasse junto do
 * acesso ao banco (que é `server-only`), importar um rótulo no navegador
 * quebraria o build. O acesso ao Supabase vive em `repositorio.ts`.
 */

export const statusLead = [
  "novo",
  "contatado",
  "call_marcada",
  "call_feita",
  "fechado",
  "perdido",
] as const;

export type StatusLead = (typeof statusLead)[number];

export const rotuloStatus: Record<StatusLead, string> = {
  novo: "Novo",
  contatado: "Contatado",
  call_marcada: "Call marcada",
  call_feita: "Call feita",
  fechado: "Fechado",
  perdido: "Perdido",
};

/** Dourado = precisa de você. Verde = fechou. Apagado = encerrado. */
export const corStatus: Record<StatusLead, string> = {
  novo: "bg-dourado text-onyx",
  contatado: "bg-dourado/15 text-dourado border border-dourado/30",
  call_marcada: "bg-dourado/15 text-dourado border border-dourado/30",
  call_feita: "bg-marfim/10 text-marfim border border-marfim/20",
  fechado: "bg-emerald-400/15 text-emerald-300 border border-emerald-400/30",
  perdido: "bg-marfim/5 text-marfim/40 border border-marfim/10",
};

export function ehStatus(valor: unknown): valor is StatusLead {
  return typeof valor === "string" && statusLead.includes(valor as StatusLead);
}

export type Lead = {
  id: string;
  criado_em: string;
  nome: string;
  whatsapp: string;
  email: string;
  idade: string;
  peso: string;
  contexto: string | null;
  consentimento_em: string;
  status: StatusLead;
  observacoes: string | null;
};

/** Só os dígitos, no formato que o link do WhatsApp espera (55 + DDD + número). */
export function whatsappInternacional(valor: string) {
  return `55${valor.replace(/\D/g, "")}`;
}

/** Link do WhatsApp já com a primeira mensagem escrita. */
export function linkWhatsapp(lead: Lead) {
  const primeiroNome = lead.nome.trim().split(" ")[0];
  const texto = encodeURIComponent(
    `Oi, ${primeiroNome}! Aqui é da RUMO. Vi seu cadastro e quero marcar sua call de diagnóstico.`,
  );

  return `https://wa.me/${whatsappInternacional(lead.whatsapp)}?text=${texto}`;
}
