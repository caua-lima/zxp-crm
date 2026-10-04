"use client";

import { useEffect, useState } from "react";

import type { CamposEditaveis } from "@/lib/lead";
import type { ResultadoEdicao } from "@/lib/resultados";
import { horaSaoPaulo } from "@/lib/tempo";
import { OBSERVACOES_MAX, normalizarObservacoes, validarObservacoes } from "@/lib/validacao";

type Aviso =
  | { tipo: "erro"; mensagem: string }
  | { tipo: "conflito"; mensagem: string; atual: CamposEditaveis };

/**
 * Anotações do lead, com RASCUNHO.
 *
 * Três valores diferentes, que a versão anterior misturava num só:
 *   - `rascunho`   o que está na caixa agora (pertence a quem digita);
 *   - `enviado`    o que foi mandado ao servidor neste clique;
 *   - `confirmado` o que o servidor confirmou ter gravado (vem por props).
 *
 * O texto da caixa NUNCA é sobrescrito pelo servidor: nem por resposta atrasada,
 * nem por revalidação da página. Quem digita B enquanto A está sendo salvo vê B
 * preservado e marcado como "não salvo" — A chegando não o apaga nem o carimba
 * como salvo. Erro e conflito também preservam o texto. Nada é guardado em
 * localStorage: o relato de um adolescente não fica no aparelho como atalho.
 *
 * `salvar` é injetado (em vez de importar a Server Action aqui) para o
 * componente ser testável sem servidor.
 */
export function CampoObservacoes({
  confirmado,
  salvar,
  ocupado,
  onSujo,
}: {
  confirmado: string | null;
  salvar: (texto: string) => Promise<ResultadoEdicao>;
  /** Outra edição do mesmo lead em andamento: o salvamento espera a vez. */
  ocupado: boolean;
  onSujo: (sujo: boolean) => void;
}) {
  const [rascunho, setRascunho] = useState(confirmado ?? "");
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const [salvoEm, setSalvoEm] = useState<string | null>(null);

  const sujo = normalizarObservacoes(rascunho) !== normalizarObservacoes(confirmado);
  const erroTamanho = validarObservacoes(rascunho);
  const restante = OBSERVACOES_MAX - rascunho.length;

  useEffect(() => {
    onSujo(sujo);
  }, [sujo, onSujo]);

  // Ao sair da tela, não deixa "sujo" pendurado no pai.
  useEffect(() => () => onSujo(false), [onSujo]);

  async function enviar() {
    if (salvando || ocupado || erroTamanho) return;

    const enviado = rascunho;

    setSalvando(true);
    setAviso(null);

    const r = await salvar(enviado);

    setSalvando(false);

    if (r.ok) {
      setSalvoEm(horaSaoPaulo());
      return;
    }

    if (r.motivo === "conflito") {
      // Alguém gravou exatamente o que eu ia gravar — tipicamente, o meu pedido
      // anterior chegou e só a resposta se perdeu. Não há conflito de verdade.
      if (normalizarObservacoes(r.atual.observacoes) === normalizarObservacoes(enviado)) {
        setSalvoEm(horaSaoPaulo());
        return;
      }

      setAviso({ tipo: "conflito", mensagem: r.mensagem, atual: r.atual });
      return;
    }

    setAviso({ tipo: "erro", mensagem: r.mensagem });
  }

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor="observacoes" className="text-xs font-semibold tracking-wide text-texto-2 uppercase">
        Suas anotações
      </label>

      <textarea
        id="observacoes"
        rows={5}
        value={rascunho}
        onChange={(e) => {
          setRascunho(e.target.value);
          setSalvoEm(null);
        }}
        aria-describedby="observacoes-estado observacoes-contador"
        aria-invalid={!!erroTamanho}
        placeholder="O que você percebeu na conversa, o que combinaram, o que falta."
        className="w-full resize-y rounded-xl border border-borda bg-onyx px-4 py-3 text-texto transition placeholder:text-texto-3 focus:border-dourado/60"
      />

      <p
        id="observacoes-contador"
        className={`text-right text-xs ${restante < 0 ? "font-semibold text-dourado" : "text-texto-3"}`}
      >
        {rascunho.length.toLocaleString("pt-BR")} / {OBSERVACOES_MAX.toLocaleString("pt-BR")}
      </p>

      {erroTamanho && (
        <p role="alert" className="text-sm text-dourado">
          {erroTamanho}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={enviar}
          disabled={salvando || ocupado || !sujo || !!erroTamanho}
          className="min-h-11 rounded-xl border border-borda px-5 text-sm font-semibold text-texto transition hover:border-dourado/50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {salvando ? "Salvando…" : "Salvar anotações"}
        </button>

        {/* Um único lugar diz em que pé o texto está. */}
        <p id="observacoes-estado" role="status" aria-live="polite" className="text-sm text-texto-2">
          {salvando
            ? "Salvando…"
            : sujo
              ? "Alterações não salvas"
              : salvoEm
                ? `Salvo às ${salvoEm}`
                : ""}
        </p>
      </div>

      {aviso?.tipo === "erro" && (
        <p role="alert" className="rounded-lg border border-dourado/40 bg-dourado/10 p-3 text-sm text-texto">
          {aviso.mensagem}
        </p>
      )}

      {aviso?.tipo === "conflito" && (
        <div role="alert" className="flex flex-col gap-3 rounded-lg border border-dourado/40 bg-dourado/10 p-3 text-sm text-texto">
          <p className="font-semibold">{aviso.mensagem}</p>

          <div>
            <p className="text-xs font-semibold tracking-wide text-texto-2 uppercase">Versão que está no servidor</p>
            <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap text-texto [overflow-wrap:anywhere]">
              {aviso.atual.observacoes ?? "(sem anotações)"}
            </pre>
          </div>

          <p className="text-texto-2">Seu texto continua na caixa acima. Escolha o que fazer:</p>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setRascunho(aviso.atual.observacoes ?? "");
                setAviso(null);
              }}
              className="min-h-11 rounded-lg border border-borda px-4 font-semibold text-texto transition hover:border-dourado/50"
            >
              Usar a versão do servidor
            </button>

            <button
              type="button"
              onClick={enviar}
              disabled={salvando || ocupado}
              className="min-h-11 rounded-lg bg-dourado px-4 font-bold text-onyx transition hover:brightness-110 disabled:opacity-50"
            >
              Salvar o meu por cima
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
