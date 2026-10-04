import Link from "next/link";

import { EtiquetaStatus } from "@/components/EtiquetaStatus";
import { Selo } from "@/components/Selo";
import { infoFaixa, type ResumoLead } from "@/lib/lead";
import { quandoChegou, quandoRetorno } from "@/lib/tempo";

export function CartaoLead({ lead, de }: { lead: ResumoLead; de: string }) {
  const faixa = infoFaixa(lead.idade);
  const retorno = lead.proxima_acao_em ? quandoRetorno(lead.proxima_acao_em) : null;

  return (
    <li>
      <Link
        href={`/leads/${lead.id}${de}`}
        className="block min-w-0 rounded-2xl border border-onyx-line bg-onyx-raised p-4 transition hover:border-dourado/40"
      >
        <div className="flex items-start justify-between gap-3">
          <h2 className="min-w-0 font-display text-base font-bold text-texto [overflow-wrap:anywhere]">
            {lead.nome}
          </h2>
          <EtiquetaStatus status={lead.status} />
        </div>

        <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-texto-2">
          <span>{lead.idade ? `${lead.idade} anos` : "idade não informada"}</span>
          <span aria-hidden>·</span>
          <time dateTime={lead.criado_em}>{quandoChegou(lead.criado_em)}</time>
        </p>

        {(faixa.menor || faixa.ambigua || lead.nao_contatar_em) && (
          <p className="mt-2 flex flex-wrap gap-1.5">
            {lead.nao_contatar_em && <Selo destaque>Não contatar</Selo>}
            {faixa.menor && <Selo>Menor de idade</Selo>}
            {faixa.ambigua && <Selo>Faixa antiga 16–18</Selo>}
          </p>
        )}

        {lead.peso && (
          <p className="mt-2.5 line-clamp-2 text-sm leading-relaxed text-texto [overflow-wrap:anywhere]">
            {lead.peso}
          </p>
        )}

        {retorno && (
          <p className="mt-2.5 text-sm text-texto-2">
            Retorno: {retorno.texto}
            {retorno.atrasado && <strong className="ml-1.5 font-semibold text-dourado">· atrasado</strong>}
          </p>
        )}
      </Link>
    </li>
  );
}
