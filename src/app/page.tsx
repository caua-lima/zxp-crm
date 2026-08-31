import { Cabecalho } from "@/components/Cabecalho";
import { CartaoLead } from "@/components/CartaoLead";
import { FiltroStatus } from "@/components/FiltroStatus";
import {
  ehStatus,
  rotuloStatus,
  statusLead,
  type StatusLead,
} from "@/lib/lead";
import { listarLeads } from "@/lib/repositorio";

export default async function PaginaLeads(props: PageProps<"/">) {
  // No Next 16 `searchParams` é uma Promise — acesso síncrono foi removido.
  const { status } = await props.searchParams;
  const filtro: StatusLead | null = ehStatus(status) ? status : null;

  const leads = await listarLeads();

  const contagem = Object.fromEntries(
    statusLead.map((s) => [s, leads.filter((l) => l.status === s).length]),
  ) as Record<StatusLead, number>;

  const visiveis = filtro ? leads.filter((l) => l.status === filtro) : leads;

  return (
    <>
      <Cabecalho />

      <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-6">
        <h1 className="font-display text-2xl font-bold text-marfim">
          {leads.length === 0
            ? "Nenhum lead ainda"
            : `${visiveis.length} ${visiveis.length === 1 ? "lead" : "leads"}`}
        </h1>

        <p className="mt-1 mb-5 text-sm text-marfim/50">
          {filtro
            ? `${rotuloStatus[filtro]} · de ${leads.length} no total`
            : "Mais recentes primeiro."}
        </p>

        <FiltroStatus
          ativo={filtro}
          contagem={contagem}
          total={leads.length}
        />

        {visiveis.length === 0 ? (
          <p className="mt-10 text-center text-sm text-marfim/40">
            {leads.length === 0
              ? "Quando alguém preencher o formulário da landing page, aparece aqui."
              : "Nenhum lead com esse status."}
          </p>
        ) : (
          <ul className="mt-5 flex flex-col gap-3">
            {visiveis.map((lead) => (
              <CartaoLead key={lead.id} lead={lead} />
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
