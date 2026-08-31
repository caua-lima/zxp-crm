import Link from "next/link";

import { sair } from "@/lib/acoes";

export function Cabecalho() {
  return (
    <header className="sticky top-0 z-20 border-b border-onyx-line bg-onyx/95 backdrop-blur">
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-5 py-3">
        <Link
          href="/"
          className="flex items-center gap-2.5"
          aria-label="Painel de leads — início"
        >
          <span className="flex size-8 items-center justify-center rounded-lg bg-dourado font-display text-base font-bold text-onyx">
            Z
          </span>
          <span className="font-display text-sm font-bold tracking-wide text-marfim">
            LEADS RUMO
          </span>
        </Link>

        <form action={sair}>
          <button
            type="submit"
            className="min-h-11 rounded-lg px-3 text-sm font-medium text-marfim/50 transition hover:text-marfim"
          >
            Sair
          </button>
        </form>
      </div>
    </header>
  );
}
