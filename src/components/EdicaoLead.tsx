"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { CampoObservacoes } from "@/components/CampoObservacoes";
import { SecaoNaoContatar, SecaoRetorno, SecaoStatus, type Executar } from "@/components/SecoesEdicao";
import { salvarObservacoes } from "@/lib/acoes";
import type { CamposEditaveis } from "@/lib/lead";

const AVISO_SAIDA = "Você tem alterações não salvas. Sair mesmo assim?";

/**
 * Tudo o que se EDITA num lead, com UMA versão compartilhada.
 *
 * Status, retorno, "não contatar" e anotações gravam na mesma linha, e a versão
 * dela sobe a cada gravação. Por isso a versão mora aqui, no pai: se cada
 * seção guardasse a sua, mudar o status deixaria as anotações com a versão
 * velha, e o próximo "Salvar" daria conflito contra VOCÊ MESMO.
 *
 * Só uma gravação por vez (`ocupado`): duas em paralelo usariam a mesma versão
 * e uma delas perderia por conflito.
 */
export function EdicaoLead({ id, inicial }: { id: string; inicial: CamposEditaveis }) {
  const roteador = useRouter();

  const [atual, setAtual] = useState(inicial);
  const [ocupado, setOcupado] = useState(false);
  const [sujos, setSujos] = useState<Record<string, boolean>>({});

  // Espelho síncrono do estado: a próxima ação precisa da versão que acabou de
  // chegar, e `atual` só atualiza no próximo render.
  const versaoAtual = useRef(inicial);
  const emAndamento = useRef(false);

  const executar: Executar = useCallback(
    async (acao, extra) => {
      if (emAndamento.current) {
        return { ok: false, motivo: "indisponivel", mensagem: "Há outra gravação em andamento. Tente de novo em um instante." };
      }

      emAndamento.current = true;
      setOcupado(true);

      try {
        const r = await acao({ id, versao: versaoAtual.current.versao, ...extra });

        // Sucesso e conflito trazem o estado verdadeiro do servidor.
        if (r.ok || r.motivo === "conflito") {
          versaoAtual.current = r.atual;
          setAtual(r.atual);
          // Atualiza as partes do servidor (histórico, botão do WhatsApp). O
          // estado dos campos aqui permanece: refresh não reinicia o cliente.
          roteador.refresh();
        }

        return r;
      } catch {
        // A chamada em si falhou (sem rede, aba dormindo). Nada foi confirmado.
        return {
          ok: false,
          motivo: "indisponivel",
          mensagem: "Sem conexão com o servidor. Nada foi salvo — seu texto continua aqui.",
        };
      } finally {
        emAndamento.current = false;
        setOcupado(false);
      }
    },
    [id, roteador],
  );

  const marcarSujo = useCallback((chave: string) => {
    return (sujo: boolean) => setSujos((anterior) => (anterior[chave] === sujo ? anterior : { ...anterior, [chave]: sujo }));
  }, []);

  // Estáveis, para os efeitos dos filhos não dispararem a cada render.
  const sujoObservacoes = useMemo(() => marcarSujo("observacoes"), [marcarSujo]);
  const sujoRetorno = useMemo(() => marcarSujo("retorno"), [marcarSujo]);

  const algumSujo = Object.values(sujos).some(Boolean);

  // Proteção de saída. Cobre: fechar/recarregar a aba (beforeunload) e clicar em
  // link ou botão de sair dentro do painel. NÃO cobre o botão "voltar" do
  // navegador (não há API confiável para isso).
  useEffect(() => {
    if (!algumSujo) return;

    const aoFechar = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };

    const aoClicar = (e: MouseEvent) => {
      const alvo = e.target instanceof Element ? e.target.closest("a[href]") : null;
      if (!(alvo instanceof HTMLAnchorElement) || alvo.target === "_blank" || e.defaultPrevented) return;

      const destino = new URL(alvo.href, window.location.href);
      if (destino.origin !== window.location.origin) return;
      if (destino.pathname === window.location.pathname && destino.search === window.location.search) return;

      if (!window.confirm(AVISO_SAIDA)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    const aoEnviar = (e: SubmitEvent) => {
      // Sair (e "sair de todos") apagam a sessão; o texto digitado se perderia.
      if (!window.confirm(AVISO_SAIDA)) e.preventDefault();
    };

    window.addEventListener("beforeunload", aoFechar);
    document.addEventListener("click", aoClicar, true);
    document.addEventListener("submit", aoEnviar, true);

    return () => {
      window.removeEventListener("beforeunload", aoFechar);
      document.removeEventListener("click", aoClicar, true);
      document.removeEventListener("submit", aoEnviar, true);
    };
  }, [algumSujo]);

  return (
    <div className="flex flex-col gap-6">
      <SecaoStatus atual={atual} executar={executar} ocupado={ocupado} />

      <SecaoRetorno atual={atual} executar={executar} ocupado={ocupado} onSujo={sujoRetorno} />

      <CampoObservacoes
        confirmado={atual.observacoes}
        ocupado={ocupado}
        onSujo={sujoObservacoes}
        salvar={(texto) => executar(salvarObservacoes, { observacoes: texto })}
      />

      <SecaoNaoContatar atual={atual} executar={executar} ocupado={ocupado} />
    </div>
  );
}
