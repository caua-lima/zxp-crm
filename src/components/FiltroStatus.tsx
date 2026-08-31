import Link from "next/link";

import { rotuloStatus, statusLead, type StatusLead } from "@/lib/lead";

/**
 * Filtro por status.
 *
 * São links, não botões com estado no cliente: cada filtro tem URL própria
 * (`/?status=novo`), então dá pra favoritar, voltar pelo botão do navegador e
 * abrir "os novos" direto. E funciona antes de qualquer JavaScript carregar.
 */
export function FiltroStatus({
  ativo,
  contagem,
  total,
}: {
  ativo: StatusLead | null;
  contagem: Record<StatusLead, number>;
  total: number;
}) {
  const base =
    "inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition";

  return (
    <nav
      aria-label="Filtrar por status"
      className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1"
    >
      <Link
        href="/"
        aria-current={ativo === null ? "page" : undefined}
        className={`${base} ${
          ativo === null
            ? "border-dourado bg-dourado text-onyx"
            : "border-onyx-line text-marfim/60 hover:text-marfim"
        }`}
      >
        Todos
        <span className="text-xs opacity-60">{total}</span>
      </Link>

      {statusLead.map((status) => (
        <Link
          key={status}
          href={`/?status=${status}`}
          aria-current={ativo === status ? "page" : undefined}
          className={`${base} ${
            ativo === status
              ? "border-dourado bg-dourado text-onyx"
              : "border-onyx-line text-marfim/60 hover:text-marfim"
          }`}
        >
          {rotuloStatus[status]}
          <span className="text-xs opacity-60">{contagem[status]}</span>
        </Link>
      ))}
    </nav>
  );
}
