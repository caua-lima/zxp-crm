import Link from "next/link";
import { notFound } from "next/navigation";

import { Cabecalho } from "@/components/Cabecalho";
import { CampoObservacoes } from "@/components/CampoObservacoes";
import { SeletorStatus } from "@/components/SeletorStatus";
import { linkWhatsapp } from "@/lib/lead";
import { buscarLead } from "@/lib/repositorio";
import { dataHoraCompleta, quandoChegou } from "@/lib/tempo";

export default async function PaginaLead(props: PageProps<"/leads/[id]">) {
  // No Next 16 `params` também é uma Promise.
  const { id } = await props.params;

  const lead = await buscarLead(id);
  if (!lead) notFound();

  return (
    <>
      <Cabecalho />

      <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-6">
        <Link
          href="/"
          className="inline-flex min-h-11 items-center text-sm text-marfim/50 transition hover:text-marfim"
        >
          ← Todos os leads
        </Link>

        <h1 className="mt-2 font-display text-2xl font-bold text-marfim">
          {lead.nome}
        </h1>

        <p className="mt-1 text-sm text-marfim/50">
          {lead.idade} anos · chegou {quandoChegou(lead.criado_em)}
        </p>

        {/* Ação principal, no topo e do tamanho do polegar: o trabalho dele
            aqui é abrir a conversa, não administrar registro. */}
        <a
          href={linkWhatsapp(lead)}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-5 flex min-h-14 w-full items-center justify-center rounded-xl bg-dourado px-6 text-base font-bold text-onyx transition hover:brightness-110"
        >
          Chamar no WhatsApp
        </a>

        <div className="mt-6 flex flex-col gap-6">
          <SeletorStatus id={lead.id} atual={lead.status} />

          <section className="rounded-2xl border border-onyx-line bg-onyx-raised p-4">
            <h2 className="text-xs font-semibold tracking-wide text-marfim/40 uppercase">
              O que mais pesa
            </h2>
            <p className="mt-2 leading-relaxed text-marfim">{lead.peso}</p>

            {lead.contexto && (
              <>
                <h2 className="mt-5 text-xs font-semibold tracking-wide text-marfim/40 uppercase">
                  Nas palavras dela
                </h2>
                <p className="mt-2 leading-relaxed whitespace-pre-line text-marfim">
                  {lead.contexto}
                </p>
              </>
            )}
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="text-xs font-semibold tracking-wide text-marfim/40 uppercase">
              Contato
            </h2>

            <Dado rotulo="WhatsApp" valor={lead.whatsapp} />
            <Dado rotulo="E-mail" valor={lead.email} />
          </section>

          <CampoObservacoes id={lead.id} valor={lead.observacoes} />

          {/* Prova de consentimento (LGPD). Fica visível de propósito: se
              alguém questionar o contato, a data está à mão, não num log. */}
          <p className="border-t border-onyx-line pt-4 text-xs leading-relaxed text-marfim/30">
            Autorizou o contato em {dataHoraCompleta(lead.consentimento_em)}.
            <br />
            Cadastro recebido em {dataHoraCompleta(lead.criado_em)}.
          </p>
        </div>
      </main>
    </>
  );
}

function Dado({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-onyx-line pb-3">
      <span className="text-sm text-marfim/40">{rotulo}</span>
      <span className="text-right text-sm break-all text-marfim">{valor}</span>
    </div>
  );
}
