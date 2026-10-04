import { notFound } from "next/navigation";
import Link from "next/link";

import { BotaoCopiar } from "@/components/BotaoCopiar";
import { Cabecalho } from "@/components/Cabecalho";
import { EdicaoLead } from "@/components/EdicaoLead";
import { EtiquetaStatus } from "@/components/EtiquetaStatus";
import { Historico } from "@/components/Historico";
import { OrigemLead } from "@/components/OrigemLead";
import { Selo } from "@/components/Selo";
import { camposEditaveis, infoFaixa, linkWhatsapp } from "@/lib/lead";
import { destinoDeVolta } from "@/lib/navegacao";
import { buscarLead, listarEventos } from "@/lib/repositorio";
import { dataHoraCompleta, quandoChegou } from "@/lib/tempo";
import { formatarTelefone } from "@/lib/telefone";
import { ehUuid } from "@/lib/validacao";

export default async function PaginaLead(props: PageProps<"/leads/[id]">) {
  // No Next 16 `params` e `searchParams` também são Promises.
  const { id } = await props.params;
  const { de } = await props.searchParams;

  // Id que não é UUID nem chega ao banco.
  if (!ehUuid(id)) notFound();

  const lead = await buscarLead(id);
  if (!lead) notFound();

  const eventos = await listarEventos(id);
  const volta = destinoDeVolta(de);
  const faixa = infoFaixa(lead.idade);
  const whatsapp = linkWhatsapp(lead);

  return (
    <>
      <Cabecalho />

      <main id="conteudo" className="mx-auto w-full max-w-5xl flex-1 px-5 py-6">
        <Link
          href={volta.href}
          className="inline-flex min-h-11 items-center text-sm text-texto-2 transition hover:text-texto"
        >
          {volta.rotulo}
        </Link>

        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <h1 className="min-w-0 font-display text-2xl font-bold text-texto [overflow-wrap:anywhere]">
            {lead.nome}
          </h1>
          <EtiquetaStatus status={lead.status} />
        </div>

        <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-texto-2">
          <span>{lead.idade ? `${lead.idade} anos` : "idade não informada"}</span>
          <span aria-hidden>·</span>
          <time dateTime={lead.criado_em} title={dataHoraCompleta(lead.criado_em)}>
            chegou {quandoChegou(lead.criado_em)}
          </time>
        </p>

        {(faixa.menor || faixa.ambigua) && (
          <p className="mt-2 flex flex-wrap gap-1.5">
            {faixa.menor && <Selo>Menor de idade</Selo>}
            {faixa.ambigua && <Selo>Faixa antiga 16–18 (pode ser menor ou maior)</Selo>}
          </p>
        )}

        {/* Ação principal, no topo e do tamanho do polegar: o trabalho dele aqui
            é abrir a conversa, não administrar registro. Mas NUNCA quando a
            pessoa pediu para não ser contatada — e nunca com número inválido. */}
        <div className="mt-5">
          {lead.nao_contatar_em ? (
            <p role="alert" className="rounded-xl border border-dourado/40 bg-dourado/10 p-4 text-sm leading-relaxed text-texto">
              <strong className="font-semibold">Não contatar.</strong> Esta pessoa pediu para não ser contatada (registrado em{" "}
              {dataHoraCompleta(lead.nao_contatar_em)}). O botão de WhatsApp está bloqueado.
            </p>
          ) : whatsapp ? (
            <a
              href={whatsapp}
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-h-14 w-full items-center justify-center rounded-xl bg-dourado px-6 text-base font-bold text-onyx transition hover:brightness-110 sm:w-auto sm:min-w-72"
            >
              Chamar no WhatsApp
              <span className="sr-only"> (abre em nova aba)</span>
            </a>
          ) : (
            <p className="rounded-xl border border-onyx-line p-4 text-sm leading-relaxed text-texto-2">
              O número de WhatsApp deste cadastro não parece válido
              {lead.whatsapp ? ` (“${lead.whatsapp}”)` : " (está vazio)"}. Confira com o e-mail antes de tentar contato.
            </p>
          )}

          <p className="mt-2 text-xs leading-relaxed text-texto-3">
            Abrir o WhatsApp não marca ninguém como contatado: isso é com você, depois de falar com a pessoa.
          </p>
        </div>

        <section aria-labelledby="resumo" className="mt-6 rounded-2xl border border-onyx-line bg-onyx-raised p-4">
          <h2 id="resumo" className="text-xs font-semibold tracking-wide text-texto-2 uppercase">
            O que mais pesa
          </h2>
          <p className="mt-2 leading-relaxed text-texto [overflow-wrap:anywhere]">{lead.peso || "Não informado."}</p>

          {lead.contexto && (
            <>
              <h2 className="mt-5 text-xs font-semibold tracking-wide text-texto-2 uppercase">Contexto informado</h2>
              <p className="mt-2 leading-relaxed whitespace-pre-line text-texto [overflow-wrap:anywhere]">
                {lead.contexto}
              </p>
            </>
          )}
        </section>

        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
          {/* No celular o contato vem antes da edição; no desktop fica ao lado. */}
          <aside className="order-1 flex min-w-0 flex-col gap-6 lg:order-2 lg:sticky lg:top-20">
            <section aria-labelledby="contato" className="flex flex-col gap-3">
              <h2 id="contato" className="text-xs font-semibold tracking-wide text-texto-2 uppercase">
                Contato
              </h2>

              <div className="flex flex-col gap-1 border-b border-onyx-line pb-3">
                <span className="text-sm text-texto-3">WhatsApp</span>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm text-texto [overflow-wrap:anywhere]">
                    {lead.whatsapp ? formatarTelefone(lead.whatsapp) : "—"}
                  </span>
                  {lead.whatsapp && <BotaoCopiar valor={lead.whatsapp} rotulo="telefone" />}
                </div>
              </div>

              <div className="flex flex-col gap-1 border-b border-onyx-line pb-3">
                <span className="text-sm text-texto-3">E-mail</span>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm text-texto [overflow-wrap:anywhere]">{lead.email || "—"}</span>
                  {lead.email && <BotaoCopiar valor={lead.email} rotulo="e-mail" />}
                </div>
              </div>
            </section>

            <OrigemLead lead={lead} />

            {/* Registro do aviso no momento do cadastro. É informação para
                consulta, não uma conclusão jurídica. */}
            <section aria-labelledby="registro" className="flex flex-col gap-1.5">
              <h2 id="registro" className="text-xs font-semibold tracking-wide text-texto-2 uppercase">
                Registro do cadastro
              </h2>

              <p className="text-xs leading-relaxed text-texto-3">
                Cadastro recebido em {dataHoraCompleta(lead.criado_em)}.
                <br />
                Marcou a autorização de contato em {dataHoraCompleta(lead.consentimento_em)}.
              </p>

              {faixa.menor && (
                <p className="text-xs leading-relaxed text-texto-3">
                  {lead.confirmacao_responsavel
                    ? "Marcou no formulário que um responsável está ciente e de acordo com o contato."
                    : "Não marcou a confirmação de responsável."}{" "}
                  Isso é o que a pessoa declarou; não foi verificado.
                </p>
              )}

              {faixa.ambigua && (
                <p className="text-xs leading-relaxed text-texto-3">
                  Cadastro de antes da separação das faixas: a faixa 16–18 mistura menor e maior de idade e não havia
                  confirmação de responsável.
                </p>
              )}
            </section>
          </aside>

          <div className="order-2 flex min-w-0 flex-col gap-6 lg:order-1">
            <EdicaoLead id={lead.id} inicial={camposEditaveis(lead)} />

            <Historico eventos={eventos} />
          </div>
        </div>
      </main>
    </>
  );
}
