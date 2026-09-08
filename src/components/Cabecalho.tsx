import Link from "next/link";

import { Logo } from "@/components/Logo";
import { sair } from "@/lib/acoes";

export function Cabecalho() {
  return (
    <header className="sticky top-0 z-20 border-b border-onyx-line bg-onyx/95 backdrop-blur">
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-5 py-3">
        {/* min-h-11 (44px) garante alvo de toque confortável no celular */}
        <Link
          href="/"
          aria-label="ZXP CRM — todos os leads"
          className="-mx-2 flex min-h-11 items-center rounded-lg px-2"
        >
          <Logo compact />
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
