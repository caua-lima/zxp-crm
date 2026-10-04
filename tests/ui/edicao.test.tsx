// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CamposEditaveis } from "@/lib/lead";
import type { ResultadoEdicao } from "@/lib/resultados";

// As Server Actions são trocadas por funções controláveis: o que se testa aqui
// é o COMPONENTE (versão compartilhada, exclusão mútua, proteção de saída), não
// o servidor — esse já é coberto em tests/integracao.
vi.mock("@/lib/acoes", () => ({
  mudarStatus: vi.fn(),
  salvarObservacoes: vi.fn(),
  salvarRetorno: vi.fn(),
  definirNaoContatar: vi.fn(),
}));

import { definirNaoContatar, mudarStatus, salvarObservacoes } from "@/lib/acoes";
import { EdicaoLead } from "@/components/EdicaoLead";

const ID = "0a9c9026-d9b6-4397-a1e2-c81c9ad737ec";

const inicial: CamposEditaveis = {
  versao: 1,
  status: "novo",
  observacoes: null,
  proxima_acao_em: null,
  proxima_acao: null,
  nao_contatar_em: null,
  atualizado_em: null,
};

const ok = (parcial: Partial<CamposEditaveis>): ResultadoEdicao => ({
  ok: true,
  atual: { ...inicial, ...parcial },
});

const mStatus = vi.mocked(mudarStatus);
const mObs = vi.mocked(salvarObservacoes);
const mNao = vi.mocked(definirNaoContatar);

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(cleanup);

describe("EdicaoLead — versão compartilhada", () => {
  it("mudar o status e DEPOIS salvar anotações usa a versão NOVA (não dá conflito contra você mesmo)", async () => {
    const usuario = userEvent.setup();

    mStatus.mockResolvedValue(ok({ status: "contatado", versao: 2 }));
    mObs.mockResolvedValue(ok({ status: "contatado", versao: 3, observacoes: "falei com a Ana" }));

    render(<EdicaoLead id={ID} inicial={inicial} />);

    await usuario.selectOptions(screen.getByLabelText("Status"), "contatado");
    await screen.findByText(/Status alterado para/);

    await usuario.type(screen.getByLabelText("Suas anotações"), "falei com a Ana");
    await usuario.click(screen.getByRole("button", { name: "Salvar anotações" }));
    await screen.findByText(/Salvo às/);

    // A primeira ação usou a versão 1; a segunda, a 2 — a que a primeira devolveu.
    expect(mStatus).toHaveBeenCalledWith({ id: ID, versao: 1, status: "contatado" });
    expect(mObs).toHaveBeenCalledWith({ id: ID, versao: 2, observacoes: "falei com a Ana" });
  });

  it("falha ao mudar status: o select continua mostrando o status CONFIRMADO", async () => {
    const usuario = userEvent.setup();

    mStatus.mockResolvedValue({
      ok: false,
      motivo: "indisponivel",
      mensagem: "Não consegui falar com o banco. Nada foi salvo — seu texto continua aqui.",
    });

    render(<EdicaoLead id={ID} inicial={inicial} />);

    await usuario.selectOptions(screen.getByLabelText("Status"), "fechado");

    expect((await screen.findByRole("alert")).textContent).toContain("Nada foi salvo");
    expect((screen.getByLabelText("Status") as HTMLSelectElement).value).toBe("novo");
  });

  it("conflito no status: mostra o status ATUAL do servidor e avisa", async () => {
    const usuario = userEvent.setup();

    mStatus.mockResolvedValue({
      ok: false,
      motivo: "conflito",
      mensagem: "Este lead foi alterado em outro lugar desde que você abriu.",
      atual: { ...inicial, status: "call_marcada", versao: 4 },
    });

    render(<EdicaoLead id={ID} inicial={inicial} />);

    await usuario.selectOptions(screen.getByLabelText("Status"), "fechado");

    const alerta = await screen.findByRole("alert");
    expect(alerta.textContent).toContain("alterado em outro lugar");
    expect(alerta.textContent).toContain("Call marcada");
    expect((screen.getByLabelText("Status") as HTMLSelectElement).value).toBe("call_marcada");
  });

  it("'Marcar como contatado' só aparece com status Novo", async () => {
    const usuario = userEvent.setup();

    mStatus.mockResolvedValue(ok({ status: "contatado", versao: 2 }));

    render(<EdicaoLead id={ID} inicial={inicial} />);

    await usuario.click(screen.getByRole("button", { name: "Marcar como contatado" }));
    await screen.findByText(/Status alterado/);

    expect(screen.queryByRole("button", { name: "Marcar como contatado" })).toBeNull();
  });

  it("só UMA gravação por vez: a segunda não dispara em paralelo com a mesma versão", async () => {
    const usuario = userEvent.setup();
    let liberar!: (r: ResultadoEdicao) => void;

    mObs.mockImplementation(() => new Promise<ResultadoEdicao>((r) => (liberar = r)));

    render(<EdicaoLead id={ID} inicial={inicial} />);

    await usuario.type(screen.getByLabelText("Suas anotações"), "a");
    await usuario.click(screen.getByRole("button", { name: "Salvar anotações" }));

    // Durante a gravação, o status e o "não contatar" ficam travados.
    expect((screen.getByLabelText("Status") as HTMLSelectElement).disabled).toBe(true);
    expect((screen.getByRole("switch") as HTMLButtonElement).disabled).toBe(true);
    expect(mStatus).not.toHaveBeenCalled();

    await act(async () => liberar(ok({ versao: 2, observacoes: "a" })));

    expect((screen.getByLabelText("Status") as HTMLSelectElement).disabled).toBe(false);
  });

  it("'não contatar' liga e desliga com o estado do servidor", async () => {
    const usuario = userEvent.setup();

    mNao.mockResolvedValue(ok({ versao: 2, nao_contatar_em: "2026-10-04T12:00:00.000Z" }));

    render(<EdicaoLead id={ID} inicial={inicial} />);

    const chave = screen.getByRole("switch");
    expect(chave.getAttribute("aria-checked")).toBe("false");

    await usuario.click(chave);
    await screen.findByText(/NÃO contatar/);

    expect(screen.getByRole("switch").getAttribute("aria-checked")).toBe("true");
    expect(mNao).toHaveBeenCalledWith({ id: ID, versao: 1, ativo: true });
  });

  it("a chamada em si falhar (sem rede) não perde o texto nem trava a tela", async () => {
    const usuario = userEvent.setup();

    mObs.mockRejectedValue(new Error("Failed to fetch"));

    render(<EdicaoLead id={ID} inicial={inicial} />);

    await usuario.type(screen.getByLabelText("Suas anotações"), "relato");
    await usuario.click(screen.getByRole("button", { name: "Salvar anotações" }));

    expect((await screen.findByRole("alert")).textContent).toContain("Sem conexão");
    expect((screen.getByLabelText("Suas anotações") as HTMLTextAreaElement).value).toBe("relato");
    // E dá para tentar de novo.
    expect((screen.getByRole("button", { name: "Salvar anotações" }) as HTMLButtonElement).disabled).toBe(false);
  });
});

describe("EdicaoLead — proteção de saída com rascunho", () => {
  it("com texto não salvo, fechar a aba pede confirmação (beforeunload)", async () => {
    const usuario = userEvent.setup();

    render(<EdicaoLead id={ID} inicial={inicial} />);

    const limpo = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(limpo);
    expect(limpo.defaultPrevented).toBe(false);

    await usuario.type(screen.getByLabelText("Suas anotações"), "rascunho");

    const sujo = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(sujo);
    expect(sujo.defaultPrevented).toBe(true);
  });

  it("clicar num link interno com rascunho pergunta; 'ficar' cancela a navegação", async () => {
    const usuario = userEvent.setup();
    const confirmar = vi.spyOn(window, "confirm").mockReturnValue(false);

    render(
      <>
        <a href="/outra-pagina">Todos os leads</a>
        <EdicaoLead id={ID} inicial={inicial} />
      </>,
    );

    await usuario.type(screen.getByLabelText("Suas anotações"), "rascunho");

    const clique = new MouseEvent("click", { bubbles: true, cancelable: true });
    screen.getByText("Todos os leads").dispatchEvent(clique);

    expect(confirmar).toHaveBeenCalledTimes(1);
    expect(clique.defaultPrevented).toBe(true); // ficou

    confirmar.mockReturnValue(true);
    const clique2 = new MouseEvent("click", { bubbles: true, cancelable: true });
    screen.getByText("Todos os leads").dispatchEvent(clique2);

    expect(clique2.defaultPrevented).toBe(false); // saiu
  });

  it("sem rascunho, não pergunta nada", () => {
    const confirmar = vi.spyOn(window, "confirm").mockReturnValue(false);

    render(
      <>
        <a href="/outra-pagina">Todos os leads</a>
        <EdicaoLead id={ID} inicial={inicial} />
      </>,
    );

    const clique = new MouseEvent("click", { bubbles: true, cancelable: true });
    screen.getByText("Todos os leads").dispatchEvent(clique);

    expect(confirmar).not.toHaveBeenCalled();
    expect(clique.defaultPrevented).toBe(false);
  });

  it("depois de SALVAR, a proteção some (não pergunta sobre o que já foi salvo)", async () => {
    const usuario = userEvent.setup();

    mObs.mockResolvedValue(ok({ versao: 2, observacoes: "rascunho" }));

    render(<EdicaoLead id={ID} inicial={inicial} />);

    await usuario.type(screen.getByLabelText("Suas anotações"), "rascunho");
    await usuario.click(screen.getByRole("button", { name: "Salvar anotações" }));
    await screen.findByText(/Salvo às/);

    const evento = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(evento);

    expect(evento.defaultPrevented).toBe(false);
  });

  it("links que abrem em outra aba e âncoras da mesma página não perguntam", async () => {
    const usuario = userEvent.setup();
    const confirmar = vi.spyOn(window, "confirm").mockReturnValue(false);

    render(
      <>
        <a href="https://wa.me/5511999991234" target="_blank" rel="noreferrer">
          WhatsApp
        </a>
        <EdicaoLead id={ID} inicial={inicial} />
      </>,
    );

    await usuario.type(screen.getByLabelText("Suas anotações"), "rascunho");

    fireEvent.click(screen.getByText("WhatsApp"));

    expect(confirmar).not.toHaveBeenCalled();
  });
});
