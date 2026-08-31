/**
 * Formatação de data no fuso de quem lê, não no do servidor.
 *
 * A função roda na Vercel, onde o relógio está em UTC. Sem fixar o fuso, um
 * lead que chegou às 21h em São Paulo apareceria como "00h do dia seguinte" —
 * e "quando essa pessoa se cadastrou" é justamente o que decide se você liga
 * agora ou amanhã.
 */

const FUSO = "America/Sao_Paulo";

const horaCurta = new Intl.DateTimeFormat("pt-BR", {
  timeZone: FUSO,
  hour: "2-digit",
  minute: "2-digit",
});

const dataCurta = new Intl.DateTimeFormat("pt-BR", {
  timeZone: FUSO,
  day: "2-digit",
  month: "2-digit",
});

const dataCompleta = new Intl.DateTimeFormat("pt-BR", {
  timeZone: FUSO,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export function quandoChegou(iso: string) {
  const data = new Date(iso);
  const minutos = Math.floor((Date.now() - data.getTime()) / 60_000);

  if (minutos < 1) return "agora";
  if (minutos < 60) return `há ${minutos} min`;

  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `há ${horas}h`;

  const dias = Math.floor(horas / 24);
  if (dias === 1) return `ontem, ${horaCurta.format(data)}`;
  if (dias < 7) return `há ${dias} dias`;

  return dataCurta.format(data);
}

export function dataHoraCompleta(iso: string) {
  return dataCompleta.format(new Date(iso));
}
