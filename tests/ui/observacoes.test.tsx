// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CampoObservacoes } from "@/components/CampoObservacoes";
import type { CamposEditaveis } from "@/lib/lead";
import type { ResultadoEdicao } from "@/lib/resultados";

afterEach(cleanup);

const atualDe = (observacoes: string | null, versao = 2): CamposEditaveis => ({
  versao,
  status: "novo",
  observacoes,
  proxima_acao_em: null,
  proxima_acao: null,
  nao_contatar_em: null,
  atualizado_em: null,
});

const ok = (observacoes: string | null): ResultadoEdicao => ({ ok: true, atual: atualDe(observacoes) });

/** Promessa que o teste resolve na hora que quiser (simula uma resposta lenta). */
function adiada<T>() {
  let resolver!: (v: T) => void;
  const promessa = new Promise<T>((r) => (resolver = r));

  return { promessa, resolver };
}

/**
 * Faz o papel do pai (EdicaoLead): guarda o valor CONFIRMADO e o atualiza
 * quando o servidor responde — sem tocar no texto da caixa.
 */
function Hospedeiro({
  inicial = null,
  servidor,
  onSujo = () => undefined,
  ocupado = false,
}: {
  inicial?: string | null;
  servidor: (texto: string) => Promise<ResultadoEdicao>;
  onSujo?: (s: boolean) => void;
  ocupado?: boolean;
}) {
  const [confirmado, setConfirmado] = useState(inicial);

  return (
    <CampoObservacoes
      confirmado={confirmado}
      ocupado={ocupado}
      onSujo={onSujo}
      salvar={async (texto) => {
        const r = await servidor(texto);
        if (r.ok || r.motivo === "conflito") setConfirmado(r.atual.observacoes);

        return r;
      }}
    />
  );
}

const caixa = () => screen.getByLabelText("Suas anotações") as HTMLTextAreaElement;
const botao = () => screen.getByRole("button", { name: /salvar anotações|salvando/i });

describe("CampoObservacoes", () => {
  it("SALVAR A, DIGITAR B durante o pedido: o sucesso de A não apaga B nem o marca como salvo", async () => {
    const usuario = userEvent.setup();
    const { promessa, resolver } = adiada<ResultadoEdicao>();

    render(<Hospedeiro servidor={() => promessa} />);

    await usuario.type(caixa(), "texto A");
    await usuario.click(botao());

    // O pedido está no ar. A pessoa continua digitando.
    expect(screen.getAllByText("Salvando…").length).toBeGreaterThan(0);
    await usuario.type(caixa(), " e mais B");

    // A resposta de A chega.
    await act(async () => resolver(ok("texto A")));

    expect(caixa().value).toBe("texto A e mais B");
    expect((screen.getByRole("status")).textContent).toContain("Alterações não salvas");
    expect(screen.queryByText(/Salvo às/)).toBeNull();
  });

  it("salvar e não mexer mais: mostra 'Salvo às HH:mm' e nada pendente", async () => {
    const usuario = userEvent.setup();

    render(<Hospedeiro servidor={async (t) => ok(t)} />);

    await usuario.type(caixa(), "anotação");
    await usuario.click(botao());

    expect(await screen.findByText(/Salvo às \d{2}:\d{2}/)).toBeTruthy();
    expect(screen.queryByText("Alterações não salvas")).toBeNull();
  });

  it("ERRO: o texto fica na caixa, continua 'não salvo' e a mensagem aparece", async () => {
    const usuario = userEvent.setup();

    render(
      <Hospedeiro
        servidor={async () => ({
          ok: false,
          motivo: "indisponivel",
          mensagem: "Não consegui falar com o banco. Nada foi salvo — seu texto continua aqui.",
        })}
      />,
    );

    await usuario.type(caixa(), "relato importante");
    await usuario.click(botao());

    expect((await screen.findByRole("alert")).textContent).toContain("Nada foi salvo");
    expect(caixa().value).toBe("relato importante");
    expect((screen.getByRole("status")).textContent).toContain("Alterações não salvas");
    expect(screen.queryByText(/Salvo às/)).toBeNull();
  });

  it("CONFLITO: mostra a versão do servidor, PRESERVA o texto, e deixa escolher", async () => {
    const usuario = userEvent.setup();
    const servidor = vi
      .fn<(t: string) => Promise<ResultadoEdicao>>()
      .mockResolvedValueOnce({
        ok: false,
        motivo: "conflito",
        mensagem: "Este lead foi alterado em outro lugar desde que você abriu.",
        atual: atualDe("escrito no notebook", 3),
      })
      .mockResolvedValueOnce(ok("escrito no celular"));

    render(<Hospedeiro servidor={servidor} />);

    await usuario.type(caixa(), "escrito no celular");
    await usuario.click(botao());

    const alerta = await screen.findByRole("alert");
    expect((alerta).textContent).toContain("alterado em outro lugar");
    expect((alerta).textContent).toContain("escrito no notebook");
    expect(caixa().value).toBe("escrito no celular"); // nada foi sobrescrito

    // Opção: manter o meu e salvar por cima (reenvia com a versão nova).
    await usuario.click(screen.getByRole("button", { name: "Salvar o meu por cima" }));

    expect(servidor).toHaveBeenCalledTimes(2);
    expect(await screen.findByText(/Salvo às/)).toBeTruthy();
    expect(caixa().value).toBe("escrito no celular");
  });

  it("CONFLITO → 'Usar a versão do servidor' troca o texto pelo do servidor", async () => {
    const usuario = userEvent.setup();

    render(
      <Hospedeiro
        servidor={async () => ({
          ok: false,
          motivo: "conflito",
          mensagem: "Este lead foi alterado em outro lugar desde que você abriu.",
          atual: atualDe("versão do servidor", 3),
        })}
      />,
    );

    await usuario.type(caixa(), "o meu");
    await usuario.click(botao());
    await usuario.click(await screen.findByRole("button", { name: "Usar a versão do servidor" }));

    expect(caixa().value).toBe("versão do servidor");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("'conflito' em que o servidor já tem EXATAMENTE o meu texto (resposta perdida) não é conflito", async () => {
    const usuario = userEvent.setup();

    render(
      <Hospedeiro
        servidor={async () => ({
          ok: false,
          motivo: "conflito",
          mensagem: "alterado",
          atual: atualDe("meu texto", 3),
        })}
      />,
    );

    await usuario.type(caixa(), "meu texto");
    await usuario.click(botao());

    expect(await screen.findByText(/Salvo às/)).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("acima de 5.000 caracteres: mensagem clara e o botão de salvar fica desabilitado", () => {
    render(<Hospedeiro servidor={async (t) => ok(t)} />);

    fireEvent.change(caixa(), { target: { value: "x".repeat(5001) } });

    expect((screen.getByRole("alert")).textContent).toContain("passam de 5.000");
    expect((botao() as HTMLButtonElement).disabled).toBe(true);
  });

  it("exatamente 5.000 caracteres é aceito", () => {
    render(<Hospedeiro servidor={async (t) => ok(t)} />);

    fireEvent.change(caixa(), { target: { value: "x".repeat(5000) } });

    expect(screen.queryByRole("alert")).toBeNull();
    expect((botao() as HTMLButtonElement).disabled).toBe(false);
  });

  it("só espaços NÃO conta como alteração (senão ficaria 'não salvo' para sempre)", async () => {
    const usuario = userEvent.setup();

    render(<Hospedeiro inicial={null} servidor={async (t) => ok(t)} />);

    await usuario.type(caixa(), "   ");

    expect(screen.queryByText("Alterações não salvas")).toBeNull();
    expect((botao() as HTMLButtonElement).disabled).toBe(true);
  });

  it("avisa o pai quando fica 'sujo' e quando deixa de ficar", async () => {
    const usuario = userEvent.setup();
    const onSujo = vi.fn();

    render(<Hospedeiro servidor={async (t) => ok(t)} onSujo={onSujo} />);

    await usuario.type(caixa(), "a");
    expect(onSujo).toHaveBeenLastCalledWith(true);

    await usuario.click(botao());
    await screen.findByText(/Salvo às/);
    expect(onSujo).toHaveBeenLastCalledWith(false);
  });

  it("desmontar a tela limpa o 'sujo' do pai (não deixa a proteção de saída pendurada)", async () => {
    const usuario = userEvent.setup();
    const onSujo = vi.fn();

    const { unmount } = render(<Hospedeiro servidor={async (t) => ok(t)} onSujo={onSujo} />);

    await usuario.type(caixa(), "a");
    unmount();

    expect(onSujo).toHaveBeenLastCalledWith(false);
  });

  it("outra gravação em andamento (ocupado): o botão espera a vez", async () => {
    const usuario = userEvent.setup();

    render(<Hospedeiro servidor={async (t) => ok(t)} ocupado />);

    await usuario.type(caixa(), "a");

    expect((botao() as HTMLButtonElement).disabled).toBe(true);
  });

  it("não guarda o relato no aparelho (localStorage/sessionStorage)", async () => {
    const usuario = userEvent.setup();

    render(<Hospedeiro servidor={async (t) => ok(t)} />);
    await usuario.type(caixa(), "relato sensível");
    await usuario.click(botao());
    await screen.findByText(/Salvo às/);

    expect(JSON.stringify({ ...localStorage })).not.toContain("relato sensível");
    expect(JSON.stringify({ ...sessionStorage })).not.toContain("relato sensível");
  });
});
