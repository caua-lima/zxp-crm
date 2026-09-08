import { redirect } from "next/navigation";

import { FormularioLogin } from "@/components/FormularioLogin";
import { Logo } from "@/components/Logo";
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
        <Logo />

        <p className="mt-6 mb-7 text-sm leading-relaxed text-marfim/50">
          Área restrita. Os dados aqui dentro são de pessoas reais — muitas
          delas menores de idade.
        </p>

        <FormularioLogin />
      </div>
    </main>
  );
}
