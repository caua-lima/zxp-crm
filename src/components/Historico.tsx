import { rotuloStatus, type Evento, type StatusExibido } from "@/lib/lead";
import { dataHoraCompleta, quandoRetorno } from "@/lib/tempo";

const rotulo = (s: string | null) => (s ? (rotuloStatus[s as StatusExibido] ?? s) : "—");

function descrever(e: Evento): string {
  if (e.tipo === "status") return `Status: ${rotulo(e.de)} → ${rotulo(e.para)}`;

  if (e.tipo === "nao_contatar") {
    return e.para === "ativado" ? "Marcado como NÃO contatar" : "Liberado para contato novamente";
  }

  // Retorno: o histórico guarda só as datas, nunca o texto da próxima ação.
  if (!e.para) return "Retorno removido";

  return `Retorno marcado para ${quandoRetorno(e.para).texto}`;
}

/**
 * Histórico curto. Registra O QUE mudou e QUANDO — nunca o conteúdo das
 * anotações nem o relato da pessoa (a migration não os copia).
 */
export function Historico({ eventos }: { eventos: Evento[] }) {
  return (
    <section aria-labelledby="historico">
      <h2 id="historico" className="text-xs font-semibold tracking-wide text-texto-2 uppercase">
        Histórico
      </h2>

      {eventos.length === 0 ? (
        <p className="mt-2 text-sm text-texto-3">Nenhuma mudança registrada ainda.</p>
      ) : (
        <ol className="mt-3 flex flex-col gap-2.5 border-l border-onyx-line pl-4">
          {eventos.map((e) => (
            <li key={e.id} className="text-sm">
              <p className="text-texto">{descrever(e)}</p>
              <time dateTime={e.criado_em} className="text-xs text-texto-3">
                {dataHoraCompleta(e.criado_em)}
              </time>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
