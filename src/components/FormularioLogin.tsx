"use client";

import { useActionState, useState } from "react";

import { entrar, type EstadoLogin } from "@/lib/acoes";

const estadoInicial: EstadoLogin = {};

export function FormularioLogin() {
  const [estado, acao, enviando] = useActionState(entrar, estadoInicial);
  const [visivel, setVisivel] = useState(false);
  const [capsLigado, setCapsLigado] = useState(false);

  return (
    <form action={acao} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <label htmlFor="senha" className="text-sm font-medium text-texto-2">
          Senha
        </label>

        <div className="relative">
          <input
            id="senha"
            name="senha"
            type={visivel ? "text" : "password"}
            autoComplete="current-password"
            autoFocus
            required
            aria-invalid={!!estado.erro}
            aria-describedby={estado.erro ? "senha-erro" : capsLigado ? "senha-caps" : undefined}
            onKeyUp={(e) => setCapsLigado(e.getModifierState("CapsLock"))}
            onBlur={() => setCapsLigado(false)}
            className="w-full rounded-xl border border-borda bg-onyx py-3.5 pr-24 pl-4 text-texto transition placeholder:text-texto-3 focus:border-dourado/60"
            placeholder="••••••••"
          />

          <button
            type="button"
            onClick={() => setVisivel((v) => !v)}
            aria-pressed={visivel}
            className="absolute inset-y-0 right-0 flex min-w-20 items-center justify-center rounded-r-xl px-3 text-sm font-medium text-texto-2 transition hover:text-texto"
          >
            {visivel ? "Ocultar" : "Mostrar"}
          </button>
        </div>

        {capsLigado && !estado.erro && (
          <p id="senha-caps" role="status" className="text-sm text-texto-2">
            Caps Lock está ligado.
          </p>
        )}
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
