import { redirect } from "next/navigation";

import { FormularioLogin } from "@/components/FormularioLogin";
import { sessaoAtiva } from "@/lib/sessao";

export default async function PaginaLogin() {
  // Quem já tem sessão válida não precisa ver tela de senha.
  if (await sessaoAtiva()) {
    redirect("/");
  }

  return (
    <main className="relative flex flex-1 items-center justify-center px-5 py-16">
      <div
        aria-hidden
        className="glow-dourado pointer-events-none absolute inset-0"
      />

      <div className="card-destaque relative w-full max-w-sm rounded-2xl p-7">
        <p className="font-display text-xs font-semibold tracking-[0.2em] text-dourado">
          ZXP SOLUTIONS
        </p>

        <h1 className="mt-2 font-display text-2xl font-bold text-marfim">
          Painel de leads
        </h1>

        <p className="mt-2 mb-7 text-sm leading-relaxed text-marfim/50">
          Área restrita. Os dados aqui dentro são de pessoas reais — muitas
          delas menores de idade.
        </p>

        <FormularioLogin />
      </div>
    </main>
  );
}
