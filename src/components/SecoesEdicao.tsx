"use client";

import { useEffect, useState } from "react";

import { definirNaoContatar, mudarStatus, salvarRetorno } from "@/lib/acoes";
import { rotuloStatus, statusLead, type CamposEditaveis, type StatusLead } from "@/lib/lead";
import type { ResultadoEdicao } from "@/lib/resultados";
import { isoParaLocal, localParaIso } from "@/lib/tempo";
import { PROXIMA_ACAO_MAX, validarProximaAcao } from "@/lib/validacao";

/** Executa uma ação sobre o lead com a versão MAIS RECENTE confirmada. */
export type Executar = (
  acao: (entrada: unknown) => Promise<ResultadoEdicao>,
  extra: Record<string, unknown>,
) => Promise<ResultadoEdicao>;

type Mensagem = { tipo: "ok" | "erro"; texto: string } | null;

function Mensagem({ m }: { m: Mensagem }) {
  if (!m) return null;

  return m.tipo === "erro" ? (
    <p role="alert" className="rounded-lg border border-dourado/40 bg-dourado/10 p-3 text-sm text-texto">
      {m.texto}
    </p>
  ) : (
    <p role="status" className="text-sm text-texto-2">
      {m.texto}
    </p>
  );
}

const rotuloCampo = "text-xs font-semibold tracking-wide text-texto-2 uppercase";
const campo =
  "min-h-12 w-full rounded-xl border border-borda bg-onyx px-4 py-3 text-texto transition placeholder:text-texto-3 focus:border-dourado/60 disabled:opacity-50";

// ── Status ───────────────────────────────────────────────────────────────

export function SecaoStatus({
  atual,
  executar,
  ocupado,
}: {
  atual: CamposEditaveis;
  executar: Executar;
  ocupado: boolean;
}) {
  const [mensagem, setMensagem] = useState<Mensagem>(null);
  const [acao, setAcao] = useState(false);

  async function mudar(novo: StatusLead) {
    setMensagem(null);
    setAcao(true);

    const r = await executar(mudarStatus, { status: novo });

    setAcao(false);

    if (r.ok || (r.motivo === "conflito" && r.atual.status === novo)) {
      setMensagem({ tipo: "ok", texto: `Status alterado para “${rotuloStatus[novo]}”.` });
    } else if (r.motivo === "conflito") {
      setMensagem({
        tipo: "erro",
        texto: `${r.mensagem} Mostrando o status atual: “${rotuloStatus[r.atual.status]}”.`,
      });
    } else {
      // O select é controlado por `atual.status` (só muda com confirmação do
      // servidor): em qualquer falha ele já mostra o status verdadeiro.
      setMensagem({ tipo: "erro", texto: r.mensagem });
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor="status" className={rotuloCampo}>
        Status
      </label>

      <select
        id="status"
        value={atual.status}
        disabled={ocupado || acao}
        onChange={(e) => {
          if (statusLead.includes(e.target.value as StatusLead)) mudar(e.target.value as StatusLead);
        }}
        className={campo}
      >
        {atual.status === "desconhecido" && (
          <option value="desconhecido" disabled>
            {rotuloStatus.desconhecido}
          </option>
        )}
        {statusLead.map((s) => (
          <option key={s} value={s}>
            {rotuloStatus[s]}
          </option>
        ))}
      </select>

      {/* Abrir o WhatsApp não prova que a mensagem foi enviada. O status só
          muda quando VOCÊ confirma que falou com a pessoa. */}
      {atual.status === "novo" && (
        <button
          type="button"
          disabled={ocupado || acao}
          onClick={() => mudar("contatado")}
          className="min-h-11 self-start rounded-xl border border-borda px-4 text-sm font-semibold text-texto transition hover:border-dourado/50 disabled:opacity-50"
        >
          Marcar como contatado
        </button>
      )}

      <Mensagem m={mensagem} />
    </div>
  );
}

// ── Retorno / próxima ação ───────────────────────────────────────────────

export function SecaoRetorno({
  atual,
  executar,
  ocupado,
  onSujo,
}: {
  atual: CamposEditaveis;
  executar: Executar;
  ocupado: boolean;
  onSujo: (sujo: boolean) => void;
}) {
  const confirmadoQuando = isoParaLocal(atual.proxima_acao_em);
  const confirmadoTexto = atual.proxima_acao ?? "";

  const [quando, setQuando] = useState(confirmadoQuando);
  const [texto, setTexto] = useState(confirmadoTexto);
  const [mensagem, setMensagem] = useState<Mensagem>(null);
  const [conflito, setConflito] = useState<CamposEditaveis | null>(null);
  const [acao, setAcao] = useState(false);

  const sujo = quando !== confirmadoQuando || texto !== confirmadoTexto;
  const erroTexto = validarProximaAcao(texto);
  const jaPassou = quando !== "" && (localParaIso(quando) ?? "9999") < new Date().toISOString();

  useEffect(() => {
    onSujo(sujo);
  }, [sujo, onSujo]);

  useEffect(() => () => onSujo(false), [onSujo]);

  async function gravar(limpar: boolean) {
    if (acao || ocupado || erroTexto) return;

    setMensagem(null);
    setConflito(null);
    setAcao(true);

    const r = await executar(salvarRetorno, { quando: limpar ? null : quando, texto: limpar ? "" : texto });

    setAcao(false);

    if (r.ok) {
      if (limpar) {
        setQuando("");
        setTexto("");
      }

      setMensagem({ tipo: "ok", texto: limpar ? "Retorno removido." : "Retorno salvo." });
    } else if (r.motivo === "conflito") {
      setConflito(r.atual);
    } else {
      setMensagem({ tipo: "erro", texto: r.mensagem });
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <p className={rotuloCampo}>Retorno combinado</p>

      <div className="grid gap-3 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="retorno-quando" className="text-sm text-texto-2">
            Quando (horário de Brasília)
          </label>
          <input
            id="retorno-quando"
            type="datetime-local"
            value={quando}
            onChange={(e) => setQuando(e.target.value)}
            className={campo}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="retorno-texto" className="text-sm text-texto-2">
            O que fazer
          </label>
          <input
            id="retorno-texto"
            type="text"
            value={texto}
            maxLength={PROXIMA_ACAO_MAX + 40}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Ex.: ligar para confirmar a call"
            aria-invalid={!!erroTexto}
            className={campo}
          />
        </div>
      </div>

      {erroTexto && (
        <p role="alert" className="text-sm text-dourado">
          {erroTexto}
        </p>
      )}

      {jaPassou && (
        <p className="text-sm text-texto-2">Esse horário já passou — o retorno vai aparecer como atrasado.</p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => gravar(false)}
          disabled={acao || ocupado || !sujo || quando === "" || !!erroTexto}
          className="min-h-11 rounded-xl border border-borda px-5 text-sm font-semibold text-texto transition hover:border-dourado/50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {acao ? "Salvando…" : "Salvar retorno"}
        </button>

        {(atual.proxima_acao_em || quando) && (
          <button
            type="button"
            onClick={() => gravar(true)}
            disabled={acao || ocupado}
            className="min-h-11 rounded-xl px-3 text-sm font-semibold text-texto-2 transition hover:text-texto disabled:opacity-50"
          >
            Remover retorno
          </button>
        )}

        {sujo && !acao && <p className="text-sm text-texto-2">Alterações não salvas</p>}
      </div>

      {conflito && (
        <div role="alert" className="flex flex-col gap-3 rounded-lg border border-dourado/40 bg-dourado/10 p-3 text-sm text-texto">
          <p className="font-semibold">Este lead foi alterado em outro lugar desde que você abriu.</p>
          <p className="text-texto-2">
            No servidor: {conflito.proxima_acao_em ? `${isoParaLocal(conflito.proxima_acao_em).replace("T", " ")} — ${conflito.proxima_acao ?? "sem descrição"}` : "sem retorno"}. O que você digitou continua nos campos.
          </p>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setQuando(isoParaLocal(conflito.proxima_acao_em));
                setTexto(conflito.proxima_acao ?? "");
                setConflito(null);
              }}
              className="min-h-11 rounded-lg border border-borda px-4 font-semibold text-texto transition hover:border-dourado/50"
            >
              Usar o do servidor
            </button>

            <button
              type="button"
              onClick={() => gravar(false)}
              disabled={acao || ocupado}
              className="min-h-11 rounded-lg bg-dourado px-4 font-bold text-onyx transition hover:brightness-110 disabled:opacity-50"
            >
              Salvar o meu por cima
            </button>
          </div>
        </div>
      )}

      <Mensagem m={mensagem} />
    </div>
  );
}

// ── Não contatar ─────────────────────────────────────────────────────────

export function SecaoNaoContatar({
  atual,
  executar,
  ocupado,
}: {
  atual: CamposEditaveis;
  executar: Executar;
  ocupado: boolean;
}) {
  const [mensagem, setMensagem] = useState<Mensagem>(null);
  const [acao, setAcao] = useState(false);
  const ativo = atual.nao_contatar_em !== null;

  async function alternar() {
    setMensagem(null);
    setAcao(true);

    const r = await executar(definirNaoContatar, { ativo: !ativo });

    setAcao(false);

    if (r.ok) {
      setMensagem({
        tipo: "ok",
        texto: ativo ? "Contato liberado novamente." : "Marcado como NÃO contatar.",
      });
    } else if (r.motivo === "conflito") {
      setMensagem({ tipo: "erro", texto: `${r.mensagem} Confira o estado atual e tente de novo.` });
    } else {
      setMensagem({ tipo: "erro", texto: r.mensagem });
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <p className={rotuloCampo}>Pediu para não ser contatado?</p>

      <button
        type="button"
        role="switch"
        aria-checked={ativo}
        onClick={alternar}
        disabled={ocupado || acao}
        className="flex min-h-12 items-center justify-between gap-4 rounded-xl border border-borda px-4 text-left text-sm font-medium text-texto transition hover:border-dourado/50 disabled:opacity-50"
      >
        <span>{ativo ? "Sim — não contatar" : "Não"}</span>
        <span
          aria-hidden
          className={`flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition ${ativo ? "bg-dourado" : "bg-marfim/20"}`}
        >
          <span className={`size-5 rounded-full bg-onyx transition ${ativo ? "translate-x-5" : ""}`} />
        </span>
      </button>

      <p className="text-xs leading-relaxed text-texto-3">
        Marcado, o botão de WhatsApp é bloqueado nesta tela. Não é um status comercial: vale para qualquer status e
        fica registrado no histórico.
      </p>

      <Mensagem m={mensagem} />
    </div>
  );
}
