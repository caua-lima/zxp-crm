"use client";

/**
 * Tela de erro global.
 *
 * Fala com quem USA o painel, não com quem o mantém: nada de "confira as
 * variáveis de ambiente". O detalhe técnico está no log do servidor, ligado
 * pela referência (digest) abaixo. Os dados NÃO aparecem em nenhum caso de erro.
 */
export default function Erro({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main id="conteudo" className="flex flex-1 items-center justify-center px-5 py-16">
      <div className="w-full max-w-sm text-center">
        <h1 className="font-display text-xl font-bold text-texto">Não foi possível carregar</h1>

        <p className="mt-2 text-sm leading-relaxed text-texto-2">
          Pode ser uma instabilidade passageira no banco de dados. Seus leads não foram alterados. Tente de novo em
          instantes.
        </p>

        <button
          type="button"
          onClick={reset}
          className="mt-6 min-h-12 rounded-xl bg-dourado px-6 py-3 text-sm font-bold text-onyx transition hover:brightness-110"
        >
          Tentar de novo
        </button>

        {error.digest && (
          <p className="mt-5 font-mono text-xs text-texto-3">Referência: {error.digest}</p>
        )}
      </div>
    </main>
  );
}
