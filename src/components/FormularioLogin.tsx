"use client";

import { useActionState } from "react";

import { entrar, type EstadoLogin } from "@/lib/acoes";

const estadoInicial: EstadoLogin = {};

export function FormularioLogin() {
  const [estado, acao, enviando] = useActionState(entrar, estadoInicial);

  return (
    <form action={acao} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <label htmlFor="senha" className="text-sm font-medium text-marfim/70">
          Senha
        </label>

        <input
          id="senha"
          name="senha"
          type="password"
          autoComplete="current-password"
          autoFocus
          required
          aria-invalid={!!estado.erro}
          aria-describedby={estado.erro ? "senha-erro" : undefined}
          className="w-full rounded-xl border border-onyx-line bg-onyx px-4 py-3.5 text-marfim transition placeholder:text-marfim/30 focus:border-dourado/60 focus:outline-none"
          placeholder="••••••••"
        />
      </div>

      {estado.erro && (
        <p id="senha-erro" role="alert" className="text-sm text-dourado">
          {estado.erro}
        </p>
      )}

      <button
        type="submit"
        disabled={enviando}
        className="min-h-12 rounded-xl bg-dourado px-8 py-3.5 text-base font-bold text-onyx transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {enviando ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}
