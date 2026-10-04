/**
 * Datas no fuso de São Paulo — e não no do servidor.
 *
 * A função roda na Vercel, em UTC. Sem fixar o fuso, um lead que chegou às 21h
 * em São Paulo apareceria como "00h do dia seguinte", e "quando essa pessoa
 * chamou" é o que decide se você liga agora ou amanhã.
 *
 * Tudo aqui é pura função de (instante, agora): `agora` é parâmetro para os
 * testes poderem fixar o relógio. Nada lança exceção com data ruim — registro
 * legado com data inválida mostra "data indisponível" em vez de derrubar a
 * página inteira.
 */

const FUSO = "America/Sao_Paulo";

const formatador = new Intl.DateTimeFormat("en-US", {
  timeZone: FUSO,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

type Partes = {
  ano: number;
  mes: number;
  dia: number;
  hora: number;
  minuto: number;
  segundo: number;
};

/** Relógio de parede de São Paulo num instante (ms desde 1970). */
function partesSP(instante: number): Partes {
  const mapa: Record<string, number> = {};

  for (const parte of formatador.formatToParts(new Date(instante))) {
    if (parte.type !== "literal") mapa[parte.type] = Number(parte.value);
  }

  return {
    ano: mapa.year,
    mes: mapa.month,
    dia: mapa.day,
    hora: mapa.hour,
    minuto: mapa.minute,
    segundo: mapa.second,
  };
}

/** Diferença entre o relógio de parede de SP e UTC, em ms, naquele instante. */
function deslocamentoSP(instante: number): number {
  const base = Math.floor(instante / 1000) * 1000;
  const p = partesSP(base);

  return Date.UTC(p.ano, p.mes - 1, p.dia, p.hora, p.minuto, p.segundo) - base;
}

/**
 * Converte um horário de parede de SP em instante (ms). O Brasil não tem
 * horário de verão desde 2019, mas o deslocamento é calculado, não fixado em
 * -3h: se a regra voltar, isto continua certo.
 */
export function paraInstanteSaoPaulo(
  ano: number,
  mes: number,
  dia: number,
  hora: number,
  minuto: number,
): number {
  const palpite = Date.UTC(ano, mes - 1, dia, hora, minuto);
  const primeiro = palpite - deslocamentoSP(palpite);

  // Segunda passada: o deslocamento pode ser outro no instante já corrigido.
  return palpite - deslocamentoSP(primeiro);
}

/** Lê uma data vinda do banco. Null se não for uma data razoável. */
export function analisarData(valor: unknown): Date | null {
  if (typeof valor !== "string" && !(valor instanceof Date)) return null;

  const data = new Date(valor);
  const ms = data.getTime();

  if (Number.isNaN(ms)) return null;
  // Fora disto é lixo (ou um bug de unidade), não um lead de verdade.
  if (ms < Date.UTC(2000, 0, 1) || ms > Date.UTC(2200, 0, 1)) return null;

  return data;
}

const dois = (n: number) => String(n).padStart(2, "0");

function hhmm(instante: number) {
  const p = partesSP(instante);

  return `${dois(p.hora)}:${dois(p.minuto)}`;
}

function ddmm(instante: number, agora: number) {
  const p = partesSP(instante);
  const base = `${dois(p.dia)}/${dois(p.mes)}`;

  // Registro de outro ano sem o ano é ambíguo ("30/08" de qual?).
  return p.ano === partesSP(agora).ano ? base : `${base}/${p.ano}`;
}

/** Quantos dias de CALENDÁRIO (em SP) vão de `de` até `ate`. Pode ser negativo. */
export function diasDeCalendario(de: number, ate: number): number {
  const a = partesSP(de);
  const b = partesSP(ate);

  return Math.round(
    (Date.UTC(b.ano, b.mes - 1, b.dia) - Date.UTC(a.ano, a.mes - 1, a.dia)) /
      86_400_000,
  );
}

/** Tolerância para relógio levemente adiantado entre servidor e banco. */
const TOLERANCIA_FUTURO_MS = 2 * 60_000;

/** "agora", "há 12 min", "há 3h", "ontem, 21:40", "há 4 dias", "30/08". */
export function quandoChegou(iso: unknown, agora: number = Date.now()): string {
  const data = analisarData(iso);
  if (!data) return "data indisponível";

  const instante = data.getTime();
  const diferenca = agora - instante;

  if (diferenca < -TOLERANCIA_FUTURO_MS) {
    return `data futura (${ddmm(instante, agora)} ${hhmm(instante)})`;
  }

  const minutos = Math.max(0, Math.floor(diferenca / 60_000));
  if (minutos < 1) return "agora";
  if (minutos < 60) return `há ${minutos} min`;

  const dias = diasDeCalendario(instante, agora);
  if (dias === 0) return `há ${Math.floor(minutos / 60)}h`;
  if (dias === 1) return `ontem, ${hhmm(instante)}`;
  if (dias < 7) return `há ${dias} dias`;

  return ddmm(instante, agora);
}

/** "26/09/2026 às 21:40" — a forma sem ambiguidade, para o detalhe. */
export function dataHoraCompleta(iso: unknown): string {
  const data = analisarData(iso);
  if (!data) return "data indisponível";

  const p = partesSP(data.getTime());

  return `${dois(p.dia)}/${dois(p.mes)}/${p.ano} às ${dois(p.hora)}:${dois(p.minuto)}`;
}

export type Retorno = { texto: string; atrasado: boolean };

/** Quando é o retorno combinado, e se já passou. */
export function quandoRetorno(iso: unknown, agora: number = Date.now()): Retorno {
  const data = analisarData(iso);
  if (!data) return { texto: "data indisponível", atrasado: false };

  const instante = data.getTime();
  const dias = diasDeCalendario(agora, instante);
  const atrasado = instante < agora;

  if (dias === 0) return { texto: `hoje, ${hhmm(instante)}`, atrasado };
  if (dias === 1) return { texto: `amanhã, ${hhmm(instante)}`, atrasado };
  if (dias === -1) return { texto: `ontem, ${hhmm(instante)}`, atrasado };

  return { texto: `${ddmm(instante, agora)}, ${hhmm(instante)}`, atrasado };
}

/** "15:04" no horário de São Paulo. */
export function horaSaoPaulo(instante: number = Date.now()): string {
  return hhmm(instante);
}

/** Último instante do dia de hoje em SP, em ISO UTC (para filtrar "retornos de hoje"). */
export function fimDoDiaSaoPaulo(agora: number = Date.now()): string {
  const p = partesSP(agora);
  const amanha = paraInstanteSaoPaulo(p.ano, p.mes, p.dia + 1, 0, 0);

  return new Date(amanha - 1000).toISOString();
}

const LOCAL = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

/**
 * Converte o valor de um <input type="datetime-local"> (horário de parede, sem
 * fuso) para ISO UTC, interpretando-o como horário de São Paulo — e não como o
 * fuso do servidor.
 */
export function localParaIso(valor: unknown): string | null {
  if (typeof valor !== "string") return null;

  const m = LOCAL.exec(valor);
  if (!m) return null;

  const [ano, mes, dia, hora, minuto] = m.slice(1).map(Number);
  if (mes < 1 || mes > 12 || hora > 23 || minuto > 59) return null;

  // Dia que não existe (31/02) rolaria para o mês seguinte sem avisar.
  const teste = new Date(Date.UTC(ano, mes - 1, dia));
  if (teste.getUTCMonth() !== mes - 1 || teste.getUTCDate() !== dia) return null;

  const instante = paraInstanteSaoPaulo(ano, mes, dia, hora, minuto);

  return analisarData(new Date(instante).toISOString()) ? new Date(instante).toISOString() : null;
}

/** Inverso de localParaIso: ISO → valor para <input type="datetime-local">. */
export function isoParaLocal(iso: unknown): string {
  const data = analisarData(iso);
  if (!data) return "";

  const p = partesSP(data.getTime());

  return `${p.ano}-${dois(p.mes)}-${dois(p.dia)}T${dois(p.hora)}:${dois(p.minuto)}`;
}
