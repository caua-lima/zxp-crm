import { cookies } from "next/headers";

import { BuscaLista } from "@/components/BuscaLista";
import { Cabecalho } from "@/components/Cabecalho";
import { CartaoLead } from "@/components/CartaoLead";
import { FiltroStatus } from "@/components/FiltroStatus";
import { NovidadesLista } from "@/components/NovidadesLista";
import { PaginacaoLista } from "@/components/PaginacaoLista";
import { NOME_COOKIE_BUSCA } from "@/lib/constantes";
import { decodificarCursor } from "@/lib/cursor";
import { filtroDeUrl, rotuloFiltro, sufixoDe } from "@/lib/navegacao";
import { contagens, listarLeads } from "@/lib/repositorio";
import { horaSaoPaulo } from "@/lib/tempo";
import { sanitizarBusca } from "@/lib/validacao";

export default async function PaginaLeads(props: PageProps<"/">) {
  // No Next 16 `searchParams` é uma Promise — acesso síncrono foi removido.
  const { status, cursor: cursorBruto } = await props.searchParams;

  const filtro = filtroDeUrl(typeof status === "string" ? status : null);
  const cursor = decodificarCursor(typeof cursorBruto === "string" ? cursorBruto : null);
  const busca = sanitizarBusca((await cookies()).get(NOME_COOKIE_BUSCA)?.value);

  const [pagina, c] = await Promise.all([
    listarLeads({ status: filtro, busca, cursor }),
    contagens(),
  ]);

  const consultadoEm = horaSaoPaulo();

  // O título descreve o que está na tela: busca ativa não tem total conhecido.
  const titulo = busca ? "Resultado da busca" : filtro ? rotuloFiltro(filtro) : "Todos os leads";

  const totalDoFiltro = filtro === "retornos" ? c.retornos : filtro ? c.porStatus[filtro] : c.total;
  const subtitulo = busca
    ? "Mais recentes primeiro."
    : `${totalDoFiltro.toLocaleString("pt-BR")} ${totalDoFiltro === 1 ? "lead" : "leads"} · ${
        filtro === "retornos" ? "mais urgentes primeiro" : "mais recentes primeiro"
      }`;

  const de = sufixoDe({ status: filtro, cursor: cursorBruto && cursor ? String(cursorBruto) : null });

  const vazio = busca
    ? `Nenhum lead encontrado para “${busca}”.`
    : c.total === 0
      ? "Quando alguém preencher o formulário da landing page, aparece aqui."
      : "Nenhum lead nesta visão.";

  return (
    <>
      <Cabecalho />

      <main id="conteudo" className="mx-auto w-full max-w-5xl flex-1 px-5 py-6">
        <h1 className="font-display text-2xl font-bold text-texto">{titulo}</h1>
        <p className="mt-1 mb-5 text-sm text-texto-2">{subtitulo}</p>

        <div className="flex flex-col gap-4">
          <BuscaLista termo={busca} filtro={filtro} />
          <FiltroStatus ativo={filtro} c={c} />
          <NovidadesLista key={`${c.total}-${consultadoEm}`} total={c.total} consultadoEm={consultadoEm} />
        </div>

        {pagina.ignorados > 0 && (
          <p role="status" className="mt-4 rounded-lg border border-onyx-line p-3 text-sm text-texto-2">
            {pagina.ignorados === 1
              ? "1 registro com dados inválidos foi ignorado."
              : `${pagina.ignorados} registros com dados inválidos foram ignorados.`}{" "}
            Os dados no banco não foram alterados.
          </p>
        )}

        {pagina.itens.length === 0 ? (
          <p className="mt-10 text-center text-sm text-texto-2">{vazio}</p>
        ) : (
          <ul className="mt-5 grid gap-3 lg:grid-cols-2">
            {pagina.itens.map((lead) => (
              <CartaoLead key={lead.id} lead={lead} de={de} />
            ))}
          </ul>
        )}

        <PaginacaoLista filtro={filtro} temAnterior={cursor !== null} proximo={pagina.proximo} />
      </main>
    </>
  );
}
