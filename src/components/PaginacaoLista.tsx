import Link from "next/link";

import { urlLista, type FiltroUrl } from "@/lib/navegacao";

export function PaginacaoLista({
  filtro,
  temAnterior,
  proximo,
}: {
  filtro: FiltroUrl;
  temAnterior: boolean;
  proximo: string | null;
}) {
  if (!temAnterior && !proximo) return null;

  const base =
    "inline-flex min-h-12 items-center justify-center rounded-xl border border-borda px-5 text-sm font-semibold text-texto transition hover:border-dourado/50";

  return (
    <nav aria-label="Páginas" className="mt-6 flex items-center justify-between gap-3">
      {temAnterior ? (
        <Link href={urlLista({ status: filtro })} className={base}>
          ← Primeira página
        </Link>
      ) : (
        <span />
      )}

      {proximo && (
        <Link href={urlLista({ status: filtro, cursor: proximo })} className={base}>
          Próxima página →
        </Link>
      )}
    </nav>
  );
}
