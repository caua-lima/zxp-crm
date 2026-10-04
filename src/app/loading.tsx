/**
 * Esqueleto da lista enquanto carrega. Mesma estrutura da página real (título,
 * busca, filtros, cards) para a tela não "pular" quando o conteúdo chega.
 */
export default function Carregando() {
  const bloco = "animate-pulse rounded-xl bg-marfim/10";

  return (
    <main id="conteudo" aria-busy="true" className="mx-auto w-full max-w-5xl flex-1 px-5 py-6">
      <p role="status" className="sr-only">
        Carregando leads…
      </p>

      <div className={`${bloco} h-8 w-48`} />
      <div className={`${bloco} mt-3 mb-6 h-4 w-64`} />

      <div className={`${bloco} h-12`} />
      <div className="mt-4 flex gap-2 overflow-hidden">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={`${bloco} h-11 w-28 shrink-0 rounded-full`} />
        ))}
      </div>

      <div className="mt-6 grid gap-3 lg:grid-cols-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={`${bloco} h-32 rounded-2xl`} />
        ))}
      </div>
    </main>
  );
}
