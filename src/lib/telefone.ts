/**
 * Telefone brasileiro: normalização para o link do WhatsApp.
 *
 * Duas regras que a versão anterior errava:
 *  - "+55 11 99999-1234" virava 55 + 5511999991234 (DDI duplicado).
 *  - número inválido virava só "55", e o botão abria um chat para lugar nenhum.
 *
 * O DDD 55 existe (Santa Maria/RS). Por isso o DDI nunca é detectado só pelo
 * prefixo "55": ele só é cortado quando sobram 12 ou 13 dígitos, que é o
 * comprimento de um número com DDI. Um número nacional tem no máximo 11.
 *
 * Isto valida o FORMATO. Não prova que a pessoa tem conta de WhatsApp, nem que
 * o número está ativo.
 */

/** DDDs em uso no Brasil. */
const DDDS_VALIDOS = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 24, 27, 28, 31, 32, 33, 34, 35, 37,
  38, 41, 42, 43, 44, 45, 46, 47, 48, 49, 51, 53, 54, 55, 61, 62, 63, 64, 65, 66,
  67, 68, 69, 71, 73, 74, 75, 77, 79, 81, 82, 83, 84, 85, 86, 87, 88, 89, 91, 92,
  93, 94, 95, 96, 97, 98, 99,
]);

/**
 * Devolve DDD + assinante (10 ou 11 dígitos), sem DDI, ou null se o formato
 * não for um telefone brasileiro plausível.
 */
export function digitosNacionais(valor: unknown): string | null {
  if (typeof valor !== "string" || valor.length > 40) return null;

  let digitos = valor.replace(/\D/g, "");

  // Prefixos de discagem (0, 00) não fazem parte do número: "011 91234-5678",
  // "0055 11 91234-5678". Nenhum DDD começa com zero, então é seguro cortar.
  digitos = digitos.replace(/^0+/, "");

  if ((digitos.length === 12 || digitos.length === 13) && digitos.startsWith("55")) {
    digitos = digitos.slice(2);
  }

  if (digitos.length !== 10 && digitos.length !== 11) return null;
  if (!DDDS_VALIDOS.has(Number(digitos.slice(0, 2)))) return null;

  // Celular tem 11 dígitos e começa pelo 9. Fixo tem 10 e começa de 2 a 5, mas
  // aceitamos 2–9: operadoras antigas e números de serviço ainda aparecem.
  if (digitos.length === 11 && digitos[2] !== "9") return null;
  if (digitos.length === 10 && !/[2-9]/.test(digitos[2])) return null;

  // 11111111111, 99999999999…: nunca é um número real.
  if (new Set(digitos.slice(2)).size === 1) return null;

  return digitos;
}

/** Destino do wa.me (55 + DDD + número), ou null se o número não for válido. */
export function whatsappInternacional(valor: unknown): string | null {
  const nacional = digitosNacionais(valor);

  return nacional ? `55${nacional}` : null;
}

/** "(11) 91234-5678" quando o número é válido; senão devolve o texto original. */
export function formatarTelefone(valor: string): string {
  const nacional = digitosNacionais(valor);
  if (!nacional) return valor;

  const ddd = nacional.slice(0, 2);
  const resto = nacional.slice(2);
  const corte = resto.length === 9 ? 5 : 4;

  return `(${ddd}) ${resto.slice(0, corte)}-${resto.slice(corte)}`;
}
