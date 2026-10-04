/**
 * Substitui `next/headers` nos testes: cookies e cabeçalhos viram estado que o
 * teste controla. Fora de uma requisição do Next essas funções não existem.
 */
export const jar = new Map<string, string>();
export const opcoesDosCookies = new Map<string, Record<string, unknown>>();
export const cabecalhos = new Headers();

export function reiniciarRequisicao() {
  jar.clear();
  opcoesDosCookies.clear();
  for (const chave of [...cabecalhos.keys()]) cabecalhos.delete(chave);
}

export async function cookies() {
  return {
    get: (nome: string) => (jar.has(nome) ? { name: nome, value: jar.get(nome)! } : undefined),
    set: (nome: string, valor: string, opcoes: Record<string, unknown> = {}) => {
      jar.set(nome, valor);
      opcoesDosCookies.set(nome, opcoes);
    },
    delete: (nome: string) => {
      jar.delete(nome);
    },
  };
}

export async function headers() {
  return cabecalhos;
}
