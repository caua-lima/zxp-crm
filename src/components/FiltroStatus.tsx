import Link from "next/link";

import { rotuloStatus, statusLead } from "@/lib/lead";
import type { Contagens } from "@/lib/repositorio";
import { urlLista, type FiltroUrl } from "@/lib/navegacao";

/**
 * Filtro por status.
 *
 * São links, não botões com estado no cliente: cada filtro tem URL própria
 * (`/?status=novo`), então dá pra favoritar, voltar pelo botão do navegador e
 * abrir "os novos" direto. E funciona antes de qualquer JavaScript carregar.
 *
 * Os números vêm da tabela INTEIRA (ver `contagens()`), não da página exibida.
 */
export function FiltroStatus({ ativo, c }: { ativo: FiltroUrl; c: Contagens }) {
  const base =
    "inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition";

  const chip = (selecionado: boolean) =>
    selecionado
      ? "border-dourado bg-dourado text-onyx"
      : "border-borda text-texto-2 hover:text-texto";

  const itens: Array<{ filtro: FiltroUrl; rotulo: string; n: number }> = [
    { filtro: null, rotulo: "Todos", n: c.total },
    { filtro: "novo", rotulo: rotuloStatus.novo, n: c.porStatus.novo },
    { filtro: "retornos", rotulo: "Retornos", n: c.retornos },
    ...statusLead
      .filter((s) => s !== "novo")
      .map((s) => ({ filtro: s as FiltroUrl, rotulo: rotuloStatus[s], n: c.porStatus[s] })),
  ];

  return (
    <nav aria-label="Filtrar por status" className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1">
      {itens.map(({ filtro, rotulo, n }) => (
        <Link
          key={filtro ?? "todos"}
          href={urlLista({ status: filtro })}
          aria-current={ativo === filtro ? "page" : undefined}
          className={`${base} ${chip(ativo === filtro)}`}
        >
          {rotulo}
          <span className={ativo === filtro ? "text-xs text-onyx/80" : "text-xs text-texto-3"}>
            {n}
          </span>
        </Link>
      ))}
    </nav>
  );
}
