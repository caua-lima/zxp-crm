import Link from "next/link";

import { Logo } from "@/components/Logo";
import { marca } from "@/config/marca";
import { sair, sairDeTodos } from "@/lib/acoes";

export function Cabecalho() {
  return (
    <header className="sticky top-0 z-20 border-b border-onyx-line bg-onyx/95 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-5 py-3">
        {/* min-h-11 (44px) garante alvo de toque confortável no celular */}
        <Link
          href="/"
          aria-label={`${marca.produto} — todos os leads`}
          className="-mx-2 flex min-h-11 items-center rounded-lg px-2"
        >
          <Logo compact />
        </Link>

        {/* <details> é um menu que funciona sem JavaScript e com teclado. */}
        <details className="relative">
          <summary className="flex min-h-11 cursor-pointer list-none items-center rounded-lg px-3 text-sm font-medium text-texto-2 transition marker:content-none hover:text-texto">
            Conta
          </summary>

          <div className="absolute right-0 mt-1 flex w-60 flex-col gap-1 rounded-xl border border-onyx-line bg-onyx-raised p-2 shadow-xl">
            <form action={sair}>
              <button
                type="submit"
                className="min-h-11 w-full rounded-lg px-3 text-left text-sm font-medium text-texto transition hover:bg-marfim/5"
              >
                Sair deste aparelho
              </button>
            </form>

            <form action={sairDeTodos}>
              <button
                type="submit"
                className="min-h-11 w-full rounded-lg px-3 text-left text-sm font-medium text-texto transition hover:bg-marfim/5"
              >
                Sair de todos os aparelhos
              </button>
              <p className="px-3 pb-2 text-xs leading-relaxed text-texto-3">
                Encerra todas as sessões abertas. Use se perder ou emprestar um aparelho.
              </p>
            </form>
          </div>
        </details>
      </div>
    </header>
  );
}
