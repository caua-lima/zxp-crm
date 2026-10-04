import { redirect } from "next/navigation";

import { FormularioLogin } from "@/components/FormularioLogin";
import { Logo } from "@/components/Logo";
import { sessaoAtiva } from "@/lib/sessao";

/** Avisos que o logout pode deixar na URL. O texto vem DAQUI, nunca da URL. */
const AVISOS: Record<string, string> = {
  revogacao:
    "Você saiu deste aparelho, mas não consegui encerrar a sessão no servidor. Quando o banco voltar, entre e use “Sair de todos os aparelhos”.",
  revogacao_total:
    "Não consegui encerrar as outras sessões agora. Tente de novo em instantes.",
};

export default async function PaginaLogin(props: PageProps<"/login">) {
  // Quem já tem sessão válida não precisa ver tela de senha.
  if (await sessaoAtiva()) {
    redirect("/");
  }

  const { aviso } = await props.searchParams;
  const textoAviso = typeof aviso === "string" ? AVISOS[aviso] : undefined;

  return (
    <main id="conteudo" className="relative flex flex-1 items-center justify-center px-5 py-16">
      <div aria-hidden className="glow-dourado pointer-events-none absolute inset-0" />

      <div className="card-destaque relative w-full max-w-sm rounded-2xl p-7">
        <Logo />

        <h1 className="mt-6 font-display text-xl font-bold text-texto">Acessar painel</h1>

        <p className="mt-2 mb-7 text-sm leading-relaxed text-texto-2">
          Área restrita. Os dados aqui dentro são de pessoas reais — muitas delas menores de idade.
        </p>

        {textoAviso && (
          <p role="status" className="mb-5 rounded-lg border border-dourado/30 bg-dourado/10 p-3 text-sm leading-relaxed text-texto">
            {textoAviso}
          </p>
        )}

        <FormularioLogin />
      </div>
    </main>
  );
}
