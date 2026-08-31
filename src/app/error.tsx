"use client";

export default function Erro({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="flex flex-1 items-center justify-center px-5 py-16">
      <div className="w-full max-w-sm text-center">
        <h1 className="font-display text-xl font-bold text-marfim">
          Alguma coisa quebrou
        </h1>

        <p className="mt-2 text-sm leading-relaxed text-marfim/50">
          Se acabou de configurar o painel, confira as variáveis de ambiente —
          é a causa mais comum. O detalhe do erro está no log do servidor.
        </p>

        {error.digest && (
          <p className="mt-3 font-mono text-xs text-marfim/30">
            {error.digest}
          </p>
        )}

        <button
          onClick={reset}
          className="mt-6 min-h-12 rounded-xl bg-dourado px-6 py-3 text-sm font-bold text-onyx transition hover:brightness-110"
        >
          Tentar de novo
        </button>
      </div>
    </main>
  );
}
