/**
 * Substitui `next/navigation` nos testes. No Next de verdade, redirect() e
 * notFound() LANÇAM um erro interno que o framework captura; aqui lançam erros
 * identificáveis, e unstable_rethrow faz o mesmo papel do original: deixa passar
 * o que é do framework e ignora o resto.
 */
export class RedirecionamentoTeste extends Error {
  constructor(readonly destino: string) {
    super(`NEXT_REDIRECT:${destino}`);
  }
}

export class NaoEncontradoTeste extends Error {
  constructor() {
    super("NEXT_NOT_FOUND");
  }
}

export function redirect(destino: string): never {
  throw new RedirecionamentoTeste(destino);
}

export function notFound(): never {
  throw new NaoEncontradoTeste();
}

export function unstable_rethrow(erro: unknown): void {
  if (erro instanceof RedirecionamentoTeste || erro instanceof NaoEncontradoTeste) throw erro;
}

export const roteador = { refreshChamadas: 0 };

export function useRouter() {
  return {
    refresh: () => {
      roteador.refreshChamadas++;
    },
    push: () => undefined,
    replace: () => undefined,
  };
}
