"use client";

import { useActionState } from "react";

import { salvarObservacoes, type EstadoObservacoes } from "@/lib/acoes";

const estadoInicial: EstadoObservacoes = {};

export function CampoObservacoes({
  id,
  valor,
}: {
  id: string;
  valor: string | null;
}) {
  const [estado, acao, enviando] = useActionState(
    salvarObservacoes,
    estadoInicial,
  );

  return (
    <form action={acao} className="flex flex-col gap-2">
      <input type="hidden" name="id" value={id} />

      <label
        htmlFor="observacoes"
        className="text-xs font-semibold tracking-wide text-marfim/40 uppercase"
      >
        Suas anotações
      </label>

      <textarea
        id="observacoes"
        name="observacoes"
        rows={4}
        defaultValue={valor ?? ""}
        placeholder="O que você percebeu na conversa, o que combinaram, o que falta."
        className="w-full resize-y rounded-xl border border-onyx-line bg-onyx px-4 py-3 text-marfim transition placeholder:text-marfim/25 focus:border-dourado/60 focus:outline-none"
      />

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={enviando}
          className="min-h-11 rounded-xl border border-onyx-line px-5 text-sm font-semibold text-marfim transition hover:border-dourado/50 disabled:opacity-50"
        >
          {enviando ? "Salvando…" : "Salvar"}
        </button>

        {estado.salvo && !enviando && (
          <span role="status" className="text-sm text-marfim/40">
            Salvo.
          </span>
        )}

        {estado.erro && (
          <span role="alert" className="text-sm text-dourado">
            {estado.erro}
          </span>
        )}
      </div>
    </form>
  );
}
