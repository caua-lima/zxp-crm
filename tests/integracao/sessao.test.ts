import { createHash } from "node:crypto";

import { afterEach, describe, expect, it, vi } from "vitest";

import { NOME_COOKIE_SESSAO } from "@/lib/constantes";
import { RedirecionamentoTeste } from "../stubs/next-navigation";
import { cabecalhos, jar, opcoesDosCookies } from "../stubs/next-headers";
import { capturarConsole, prepararAmbiente, pedidosAosLeads, SENHA } from "../helpers/ambiente";

const banco = prepararAmbiente();

afterEach(() => vi.restoreAllMocks());

const sha = (t: string) => createHash("sha256").update(t).digest("hex");

async function modulos() {
  const sessao = await import("@/lib/sessao");
  const auth = await import("@/lib/auth");
  const acoes = await import("@/lib/acoes");

  return { sessao, auth, acoes };
}

describe("sessão revogável", () => {
  it("abrir sessão: cookie httpOnly/lax, e o BANCO guarda só o hash (nunca o token)", async () => {
    const { sessao } = await modulos();

    await sessao.abrirSessao();

    const token = jar.get(NOME_COOKIE_SESSAO)!;
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);

    expect(opcoesDosCookies.get(NOME_COOKIE_SESSAO)).toMatchObject({
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 7 * 24 * 60 * 60,
    });

    expect(banco.sessoes).toHaveLength(1);
    expect(banco.sessoes[0].id_hash).toBe(sha(token));
    // Quem lesse a tabela não conseguiria forjar sessão.
    expect(JSON.stringify(banco.sessoes)).not.toContain(token);

    expect(await sessao.sessaoAtiva()).toBe(true);
  });

  it("em produção o cookie sai com Secure; fora dela (http local) não", async () => {
    const { sessao } = await modulos();

    vi.stubEnv("NODE_ENV", "production");
    expect(sessao.opcoesCookie()).toMatchObject({ secure: true, httpOnly: true, sameSite: "lax" });

    vi.stubEnv("NODE_ENV", "test");
    expect(sessao.opcoesCookie().secure).toBe(false);
  });

  it("sem cookie: não consulta o banco", async () => {
    const { sessao } = await modulos();

    expect(await sessao.sessaoAtiva()).toBe(false);
    expect(banco.pedidos).toHaveLength(0);
  });

  it.each([
    ["formato do modelo antigo (payload.assinatura)", "eyJleHAiOjk5OTk5OTk5OTk5OTl9.assinatura-inventada"],
    ["token com segmento extra", `${"a".repeat(43)}.extra`],
    ["curto demais", "abc"],
    ["longo demais", "a".repeat(500)],
    ["caracteres inválidos", `${"a".repeat(42)}!`],
    ["vazio", ""],
  ])("cookie forjado (%s) é recusado SEM consultar o banco", async (_nome, valor) => {
    jar.set(NOME_COOKIE_SESSAO, valor);
    const { sessao } = await modulos();

    expect(await sessao.sessaoAtiva()).toBe(false);
    expect(banco.pedidos).toHaveLength(0);
  });

  it("token com formato certo mas que o banco não conhece é recusado", async () => {
    jar.set(NOME_COOKIE_SESSAO, "A".repeat(43));
    const { sessao } = await modulos();

    expect(await sessao.sessaoAtiva()).toBe(false);
    expect(banco.pedidos).toHaveLength(1); // uma consulta de sessão, nada mais
  });

  it("sessão expirada é recusada", async () => {
    const { sessao } = await modulos();
    await sessao.abrirSessao();

    banco.sessoes[0].expira_em = new Date(Date.now() - 1000).toISOString();

    expect(await sessao.sessaoAtiva()).toBe(false);
  });

  it("LOGOUT revoga a sessão no servidor: uma CÓPIA do cookie para de funcionar", async () => {
    const { sessao, acoes } = await modulos();
    await sessao.abrirSessao();
    const copia = jar.get(NOME_COOKIE_SESSAO)!;

    await expect(acoes.sair()).rejects.toBeInstanceOf(RedirecionamentoTeste);
    expect(jar.has(NOME_COOKIE_SESSAO)).toBe(false);

    // O atacante que copiou o cookie antes do logout:
    jar.set(NOME_COOKIE_SESSAO, copia);
    expect(await sessao.sessaoAtiva()).toBe(false);
  });

  it("logout com o banco fora do ar avisa que NÃO conseguiu revogar", async () => {
    const { sessao, acoes } = await modulos();
    await sessao.abrirSessao();

    banco.falha = { status: 503, corpo: "" };

    await expect(acoes.sair()).rejects.toMatchObject({ destino: "/login?aviso=revogacao" });
    expect(jar.has(NOME_COOKIE_SESSAO)).toBe(false);
  });

  it("TROCAR A SENHA invalida todas as sessões abertas", async () => {
    const { sessao } = await modulos();
    await sessao.abrirSessao();
    expect(await sessao.sessaoAtiva()).toBe(true);

    vi.stubEnv("ADMIN_PASSWORD", "outra-senha-completamente-nova");

    expect(await sessao.sessaoAtiva()).toBe(false);
  });

  it("'sair de todos os dispositivos' revoga todas as sessões", async () => {
    const { sessao, acoes } = await modulos();

    await sessao.abrirSessao();
    const celular = jar.get(NOME_COOKIE_SESSAO)!;
    await sessao.abrirSessao();
    const notebook = jar.get(NOME_COOKIE_SESSAO)!;

    await expect(acoes.sairDeTodos()).rejects.toMatchObject({ destino: "/login" });

    for (const token of [celular, notebook]) {
      jar.set(NOME_COOKIE_SESSAO, token);
      expect(await sessao.sessaoAtiva()).toBe(false);
    }
  });

  it("falha FECHADA: banco fora do ar, ninguém entra", async () => {
    const { sessao } = await modulos();
    await sessao.abrirSessao();

    banco.falha = { status: 521, corpo: "<html>Web server is down</html>" };

    expect(await sessao.sessaoAtiva()).toBe(false);
  });

  it("banco fora do ar: validarSessao LANÇA (não finge 'sessão inválida') e exigirSessao NÃO manda para o login", async () => {
    const { sessao, auth } = await modulos();
    await sessao.abrirSessao();

    banco.falha = { status: 521, corpo: "<html>Web server is down</html>" };

    // Falha fechada, mas com o diagnóstico certo: o banco caiu, a senha não expirou.
    await expect(sessao.validarSessao()).rejects.toMatchObject({ categoria: "indisponivel" });
    await expect(auth.exigirSessao()).rejects.toMatchObject({ categoria: "indisponivel" });
    await expect(auth.exigirSessao()).rejects.not.toBeInstanceOf(RedirecionamentoTeste);
  });

  it("DAL: sem sessão, exigirSessao redireciona ao login", async () => {
    const { auth } = await modulos();

    await expect(auth.exigirSessao()).rejects.toMatchObject({ destino: "/login" });
  });

  it("a senha confere em tempo constante e rejeita a errada", async () => {
    const { sessao } = await modulos();

    expect(sessao.senhaConfere(SENHA)).toBe(true);
    expect(sessao.senhaConfere(`${SENHA}x`)).toBe(false);
    expect(sessao.senhaConfere("")).toBe(false);
    expect(sessao.senhaConfere("x".repeat(100_000))).toBe(false);
  });
});

describe("autorização antes do banco", () => {
  it("sem sessão, NENHUMA função de dados toca na tabela de leads", async () => {
    const repo = await import("@/lib/repositorio");
    const id = "0a9c9026-d9b6-4397-a1e2-c81c9ad737ec";

    const chamadas = [
      () => repo.listarLeads({ status: null, busca: "", cursor: null }),
      () => repo.buscarLead(id),
      () => repo.atualizarLead(id, 1, { status: "contatado" }),
      () => repo.contagens(),
      () => repo.listarEventos(id),
    ];

    for (const chamar of chamadas) {
      await expect(chamar()).rejects.toBeInstanceOf(RedirecionamentoTeste);
    }

    expect(banco.pedidos).toHaveLength(0);
  });

  it("token forjado, expirado ou revogado: leitura e mutação bloqueadas ANTES do banco de leads", async () => {
    const repo = await import("@/lib/repositorio");
    const { sessao } = await modulos();
    banco.semear();

    // forjado
    jar.set(NOME_COOKIE_SESSAO, "B".repeat(43));
    await expect(repo.listarLeads({ status: null, busca: "", cursor: null })).rejects.toBeInstanceOf(
      RedirecionamentoTeste,
    );

    // expirado
    await sessao.abrirSessao();
    banco.sessoes[0].expira_em = new Date(Date.now() - 1000).toISOString();
    await expect(repo.contagens()).rejects.toBeInstanceOf(RedirecionamentoTeste);

    // revogado
    await sessao.abrirSessao();
    banco.sessoes[1].revogada_em = new Date().toISOString();
    await expect(
      repo.atualizarLead(banco.leads[0].id as string, 1, { status: "contatado" }),
    ).rejects.toBeInstanceOf(RedirecionamentoTeste);

    expect(pedidosAosLeads(banco)).toHaveLength(0);
    expect(banco.leads[0].status).toBe("novo");
  });
});

describe("login", () => {
  const tentar = async (senha: string) => {
    const { acoes } = await modulos();
    const dados = new FormData();
    dados.set("senha", senha);

    return acoes.entrar({}, dados);
  };

  it("senha certa abre sessão e redireciona", async () => {
    const { acoes } = await modulos();
    const dados = new FormData();
    dados.set("senha", SENHA);

    await expect(acoes.entrar({}, dados)).rejects.toMatchObject({ destino: "/" });
    expect(banco.sessoes).toHaveLength(1);
  });

  it("senha errada: mensagem única, sem pista", async () => {
    expect(await tentar("errada")).toEqual({ erro: "Senha incorreta." });
    expect(banco.sessoes).toHaveLength(0);
  });

  it("três erros livres; o quarto bloqueia; a senha CERTA durante o bloqueio também é recusada", async () => {
    for (let i = 0; i < 3; i++) expect(await tentar(`errada-${i}`)).toEqual({ erro: "Senha incorreta." });

    const quarto = await tentar("errada-3");
    expect(quarto.erro).toMatch(/Aguarde 30 segundos/);

    const certaMasBloqueado = await tentar(SENHA);
    expect(certaMasBloqueado.erro).toMatch(/Muitas tentativas/);
    expect(banco.sessoes).toHaveLength(0);
  });

  it("origens diferentes não se afetam", async () => {
    cabecalhos.set("x-forwarded-for", "203.0.113.1");
    for (let i = 0; i < 5; i++) await tentar(`errada-${i}`);

    cabecalhos.set("x-forwarded-for", "203.0.113.2");
    expect(await tentar("errada")).toEqual({ erro: "Senha incorreta." });
  });

  it("o IP nunca é gravado em texto puro (só um HMAC)", async () => {
    cabecalhos.set("x-forwarded-for", "203.0.113.77");
    await tentar("errada");

    expect(banco.tentativas).toHaveLength(1);
    expect(JSON.stringify(banco.tentativas)).not.toContain("203.0.113.77");
    expect(banco.tentativas[0].chave).toMatch(/^[0-9a-f]{64}$/);
  });

  it("falha FECHADA: sem conseguir consultar o contador, nem a senha certa entra", async () => {
    banco.falha = { status: 503, corpo: "" };

    const resultado = await tentar(SENHA);

    expect(resultado.erro).toMatch(/Não consegui verificar o acesso/);

    banco.falha = null;
    expect(banco.sessoes).toHaveLength(0);
  });

  it("login correto zera o contador da origem", async () => {
    for (let i = 0; i < 2; i++) await tentar(`errada-${i}`);

    const { acoes } = await modulos();
    const dados = new FormData();
    dados.set("senha", SENHA);
    await expect(acoes.entrar({}, dados)).rejects.toBeInstanceOf(RedirecionamentoTeste);

    expect(banco.tentativas).toHaveLength(0);
  });

  it("a senha NUNCA aparece no log, nem a errada nem a certa", async () => {
    const consola = capturarConsole();

    await tentar("MINHA-SENHA-ERRADA-XYZ");
    const { acoes } = await modulos();
    const dados = new FormData();
    dados.set("senha", SENHA);
    await acoes.entrar({}, dados).catch(() => undefined);

    consola.parar();

    expect(consola.texto()).not.toContain("MINHA-SENHA-ERRADA-XYZ");
    expect(consola.texto()).not.toContain(SENHA);
  });

  it("senha gigante é tratada como errada, sem estourar", async () => {
    expect(await tentar("x".repeat(100_000))).toEqual({ erro: "Senha incorreta." });
  });

  it("campo ausente ou vazio", async () => {
    const { acoes } = await modulos();

    expect(await acoes.entrar({}, new FormData())).toEqual({ erro: "Digite a senha." });
  });

  it("configuração inválida falha fechada com mensagem neutra e SEM vazar valores", async () => {
    vi.stubEnv("AUTH_SECRET", "valorSecretoXYZ");
    const consola = capturarConsole();

    const resultado = await tentar(SENHA);

    consola.parar();
    expect(resultado.erro).toMatch(/não está configurado/);
    expect(consola.texto()).toContain("AUTH_SECRET");
    expect(consola.texto()).not.toContain("valorSecretoXYZ");
    expect(banco.sessoes).toHaveLength(0);
  });
});
