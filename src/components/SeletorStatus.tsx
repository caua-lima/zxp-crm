"use client";

import { useTransition } from "react";

import { mudarStatus } from "@/lib/acoes";
import { rotuloStatus, statusLead, type StatusLead } from "@/lib/lead";

export function SeletorStatus({
  id,
  atual,
}: {
  id: string;
  atual: StatusLead;
}) {
  const [pendente, iniciar] = useTransition();

  return (
    <div className="flex flex-col gap-2">
      <label
        htmlFor="status"
        className="text-xs font-semibold tracking-wide text-marfim/40 uppercase"
      >
        Status
      </label>

      <select
        id="status"
        // Controlado pelo servidor: depois que a ação revalida a rota, o valor
        // que chega por props é a verdade. Não guardamos cópia local pra não
        // existirem duas versões do mesmo dado.
        value={atual}
        disabled={pendente}
        onChange={(evento) => {
          const novo = evento.target.value;
          iniciar(async () => {
            await mudarStatus(id, novo);
          });
        }}
        className="min-h-12 w-full rounded-xl border border-onyx-line bg-onyx px-4 py-3 text-marfim transition focus:border-dourado/60 focus:outline-none disabled:opacity-50"
      >
        {statusLead.map((status) => (
          <option key={status} value={status}>
            {rotuloStatus[status]}
          </option>
        ))}
      </select>
    </div>
  );
}
