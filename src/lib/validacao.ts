/**
 * Regras de entrada compartilhadas entre cliente e servidor.
 *
 * Mesma ideia da LP: validar só na tela é enfeite. O servidor revalida tudo
 * com estas funções, e os limites vivem num lugar só para não divergirem.
 * Sem `server-only` de propósito: componentes de cliente importam daqui.
 */

export const OBSERVACOES_MAX = 5000;
export const PROXIMA_ACAO_MAX = 120;
export const BUSCA_MAX = 60;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function ehUuid(valor: unknown): valor is string {
  return typeof valor === "string" && UUID.test(valor);
}

export function ehVersao(valor: unknown): valor is number {
  return Number.isInteger(valor) && (valor as number) >= 1 && (valor as number) < 2 ** 31;
}

/** Timestamp ISO 8601 com fuso (o formato que o Postgres devolve e aceita). */
const ISO =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/;

export function ehTimestampIso(valor: unknown): valor is string {
  return (
    typeof valor === "string" &&
    valor.length <= 40 &&
    ISO.test(valor) &&
    !Number.isNaN(new Date(valor).getTime())
  );
}

export function validarObservacoes(texto: unknown): string | null {
  if (typeof texto !== "string") return "Texto inválido.";
  if (texto.length > OBSERVACOES_MAX) {
    return `As anotações passam de ${OBSERVACOES_MAX.toLocaleString("pt-BR")} caracteres. Reduza ${(texto.length - OBSERVACOES_MAX).toLocaleString("pt-BR")}.`;
  }

  return null;
}

export function validarProximaAcao(texto: unknown): string | null {
  if (typeof texto !== "string") return "Texto inválido.";
  if (texto.length > PROXIMA_ACAO_MAX) {
    return `A descrição do retorno passa de ${PROXIMA_ACAO_MAX} caracteres.`;
  }

  return null;
}

/**
 * Termo de busca seguro para entrar numa expressão PostgREST.
 *
 * O termo vai dentro de `or=(nome.ilike."*termo*",...)`. Vírgula, parêntese,
 * aspas e barra invertida mudariam a ESTRUTURA da expressão (injeção de
 * filtro), então só entram letras, números, espaço e `@ . _ + -`. `%` e `*`
 * são curingas de LIKE e também ficam de fora: quem busca "100%" não quer
 * casar tudo.
 */
export function sanitizarBusca(bruto: unknown): string {
  if (typeof bruto !== "string") return "";

  return bruto
    .normalize("NFC")
    .replace(/[^\p{L}\p{N}\s@._+-]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, BUSCA_MAX)
    .trim();
}

/**
 * Dígitos para buscar por telefone, ou null se o termo não parece telefone.
 *
 * `whatsapp_digitos` guarda o número sem máscara; aqui o termo é reduzido ao
 * mesmo formato (e o DDI +55 colado é descartado, como o número guardado).
 */
export function digitosDeBusca(bruto: unknown): string | null {
  if (typeof bruto !== "string") return null;
  if (!/^[\d\s()+-]+$/.test(bruto.trim())) return null;

  let digitos = bruto.replace(/\D/g, "").replace(/^0+/, "");
  if (digitos.length >= 12 && digitos.startsWith("55")) digitos = digitos.slice(2);

  return digitos.length >= 4 ? digitos.slice(0, 11) : null;
}

/**
 * Anotação vazia (ou só espaços) é "sem anotação": o banco guarda NULL. A
 * mesma regra serve para comparar rascunho com o valor salvo — sem ela, quem
 * apaga o texto e deixa um espaço ficaria com "alterações não salvas" para
 * sempre.
 */
export function normalizarObservacoes(texto: string | null | undefined): string | null {
  if (typeof texto !== "string") return null;

  return texto.trim() === "" ? null : texto;
}
