import type { DetalheLead } from "@/lib/lead";

const LINHAS: Array<[keyof DetalheLead, string]> = [
  ["utm_source", "Origem"],
  ["utm_medium", "Meio"],
  ["utm_campaign", "Campanha"],
  ["utm_content", "Anúncio"],
  ["utm_term", "Termo"],
  ["referrer_host", "Veio de"],
];

/**
 * De qual campanha o lead veio — o que permite acompanhar a origem até a call
 * e o fechamento. A LP só guarda utm_* e o HOST do referrer, nunca a URL.
 * "Sem origem" é uma resposta válida: acesso direto ou cadastro antigo.
 */
export function OrigemLead({ lead }: { lead: DetalheLead }) {
  const dados = LINHAS.filter(([chave]) => lead[chave]);

  return (
    <section aria-labelledby="origem" className="flex flex-col gap-2">
      <h2 id="origem" className="text-xs font-semibold tracking-wide text-texto-2 uppercase">
        De onde veio
      </h2>

      {dados.length === 0 ? (
        <p className="text-sm text-texto-3">Sem origem registrada (acesso direto ou cadastro antigo).</p>
      ) : (
        <dl className="flex flex-col gap-2">
          {dados.map(([chave, nome]) => (
            <div key={chave} className="flex items-baseline justify-between gap-4 border-b border-onyx-line pb-2">
              <dt className="text-sm text-texto-3">{nome}</dt>
              <dd className="text-right text-sm text-texto [overflow-wrap:anywhere]">{String(lead[chave])}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}
