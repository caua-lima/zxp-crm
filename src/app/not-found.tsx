import Link from "next/link";

export default function NaoEncontrado() {
  return (
    <main id="conteudo" className="flex flex-1 items-center justify-center px-5 py-16">
      <div className="text-center">
        <h1 className="font-display text-xl font-bold text-texto">Esse lead não existe</h1>

        <p className="mt-2 text-sm text-texto-2">Pode ter sido removido, ou o link está errado.</p>

        <Link
          href="/"
          className="mt-6 inline-flex min-h-12 items-center rounded-xl bg-dourado px-6 text-sm font-bold text-onyx transition hover:brightness-110"
        >
          Ver todos os leads
        </Link>
      </div>
    </main>
  );
}
