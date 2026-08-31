import Link from "next/link";

import { EtiquetaStatus } from "@/components/EtiquetaStatus";
import type { Lead } from "@/lib/lead";
import { quandoChegou } from "@/lib/tempo";

export function CartaoLead({ lead }: { lead: Lead }) {
  return (
    <li>
      <Link
        href={`/leads/${lead.id}`}
        className="block rounded-2xl border border-onyx-line bg-onyx-raised p-4 transition hover:border-dourado/40"
      >
        <div className="flex items-start justify-between gap-3">
          <h2 className="font-display text-base font-bold text-marfim">
            {lead.nome}
          </h2>
          <EtiquetaStatus status={lead.status} />
        </div>

        <p className="mt-1.5 text-sm text-marfim/50">
          {lead.idade} anos · {quandoChegou(lead.criado_em)}
        </p>

        <p className="mt-2.5 line-clamp-2 text-sm leading-relaxed text-marfim/70">
          {lead.peso}
        </p>
      </Link>
    </li>
  );
}
