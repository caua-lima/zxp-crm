"use server";

import { cookies, headers } from "next/headers";
import { redirect, unstable_rethrow } from "next/navigation";

import { configuracao } from "./config";
import { NOME_COOKIE_BUSCA, NOME_COOKIE_SESSAO } from "./constantes";
import { ErroConfiguracao, ErroCrm } from "./erros";
import { camposEditaveis, ehStatus } from "./lead";
import {
  chaveDaOrigem,
  esperaRestante,
  formatarEspera,
  limparTentativas,
  registrarFalha,
} from "./limite";
import { registrar } from "./log";
import { atualizarLead, contagens, type CamposAtualizacao } from "./repositorio";
import type { ResultadoEdicao } from "./resultados";
import {
  abrirSessao,
  encerrarTodasAsSessoes,
  fecharSessao,
  senhaConfere,
  sessaoAtiva,
  validarSessao,
} from "./sessao";
import { localParaIso } from "./tempo";
import {
  ehUuid,
  ehVersao,
  sanitizarBusca,
  validarObservacoes,
  validarProximaAcao,
} from "./validacao";

/**
 * Server Actions do painel.
 *
 * A doc do Next 16 é explícita: Server Actions são endpoints POST alcançáveis
 * sem passar pela tela. Por isso TODA ação aqui confere a sessão antes de
 * tocar em dado (o login é a exceção: é quem cria a sessão), e valida o
 * próprio argumento — o que chega do navegador é entrada não confiável, mesmo
 * que o TypeScript do componente diga o contrário.
 *
 * Nada neste arquivo registra senha, cookie, anotação ou dado do lead.
 */

export type EstadoLogin = { erro?: string };

// ── Login ────────────────────────────────────────────────────────────────

/**
 * IP de quem chamou, para o freio de login.
 *
 * Na Vercel estes cabeçalhos são definidos pela plataforma — o cliente não
 * consegue forjá-los. Fora da Vercel (servidor próprio), só é seguro se o seu
 * proxy SOBRESCREVER esses cabeçalhos: do contrário, quem ataca varia um IP
 * falso a cada tentativa e escapa do bloqueio. Ver docs/OPERACAO.md.
 */
async function origemDaRequisicao(): Promise<string> {
  const h = await headers();

  const candidato =
    h.get("x-vercel-forwarded-for") ??
    h.get("x-real-ip") ??
    h.get("x-forwarded-for")?.split(",")[0] ??
    "";

  return candidato.trim().slice(0, 64) || "desconhecida";
}

export async function entrar(
  _estadoAnterior: EstadoLogin,
  formData: FormData,
): Promise<EstadoLogin> {
  try {
    configuracao();
  } catch (erro) {
    if (erro instanceof ErroConfiguracao) {
      // Só os NOMES das variáveis com problema vão pro log, nunca valores.
      registrar("error", "login.configuracao_invalida", { problemas: erro.problemas.join("; ") });

      return { erro: "O painel não está configurado. Avise quem administra." };
    }

    throw erro;
  }

  const chave = chaveDaOrigem(await origemDaRequisicao());

  let espera: number;

  try {
    espera = await esperaRestante(chave);
  } catch (erro) {
    unstable_rethrow(erro);
    registrar("error", "login.freio_indisponivel", {
      categoria: erro instanceof ErroCrm ? erro.categoria : "desconhecida",
    });

    // Falha FECHADA: sem conseguir consultar o contador, ninguém entra. Um
    // freio que some quando o banco cai seria um freio que se desliga atacando.
    return { erro: "Não consegui verificar o acesso agora. Tente em instantes." };
  }

  if (espera > 0) {
    return { erro: `Muitas tentativas. Tente de novo em ${formatarEspera(espera)}.` };
  }

  const senha = formData.get("senha");

  if (typeof senha !== "string" || senha.length === 0) {
    return { erro: "Digite a senha." };
  }

  // Limite de tamanho: a senha de verdade é bem menor, e isto evita processar lixo.
  const correta = senha.length <= 512 && senhaConfere(senha);

  if (!correta) {
    let bloqueio = 0;

    try {
      bloqueio = await registrarFalha(chave);
    } catch (erro) {
      unstable_rethrow(erro);
      registrar("error", "login.falha_nao_registrada", {
        categoria: erro instanceof ErroCrm ? erro.categoria : "desconhecida",
      });
    }

    // Mensagem única e sem pista: nada aqui ajuda quem adivinha (se a senha
    // existe, se chegou perto, quantas faltam).
    return {
      erro:
        bloqueio > 0
          ? `Senha incorreta. Aguarde ${formatarEspera(bloqueio)} para tentar de novo.`
          : "Senha incorreta.",
    };
  }

  try {
    await abrirSessao();
  } catch (erro) {
    unstable_rethrow(erro);
    registrar("error", "login.sessao_nao_aberta", {
      categoria: erro instanceof ErroCrm ? erro.categoria : "desconhecida",
    });

    return { erro: "Não consegui iniciar a sessão agora. Tente em instantes." };
  }

  // Limpar o contador é conveniência: se falhar, o login já deu certo.
  await limparTentativas(chave).catch(() => undefined);

  redirect("/");
}

export async function sair() {
  const revogada = await fecharSessao();

  redirect(revogada ? "/login" : "/login?aviso=revogacao");
}

export async function sairDeTodos() {
  if (!(await sessaoAtiva())) redirect("/login");

  try {
    await encerrarTodasAsSessoes();
  } catch (erro) {
    unstable_rethrow(erro);
    registrar("error", "sessao.revogar_todas_falhou", {
      categoria: erro instanceof ErroCrm ? erro.categoria : "desconhecida",
    });

    redirect("/login?aviso=revogacao_total");
  }

  (await cookies()).delete(NOME_COOKIE_SESSAO);

  redirect("/login");
}

// ── Edição de lead ───────────────────────────────────────────────────────

const falha = (
  motivo: Exclude<Extract<ResultadoEdicao, { ok: false }>["motivo"], "conflito">,
  mensagem: string,
): ResultadoEdicao => ({ ok: false, motivo, mensagem });

function tratarErro(erro: unknown): ResultadoEdicao {
  // Um redirect/notFound interno do Next nunca pode virar mensagem de erro.
  unstable_rethrow(erro);

  if (erro instanceof ErroCrm) {
    if (erro.categoria === "validacao") return falha("validacao", "Dados inválidos. Confira e tente de novo.");
    if (erro.categoria === "sessao") return falha("sessao", "Sua sessão expirou.");

    if (erro.categoria === "schema_desatualizado") {
      return falha(
        "schema",
        "O banco de dados precisa ser atualizado (migration crm_0001). Nada foi salvo.",
      );
    }

    if (erro.incerto) {
      return falha(
        "incerto",
        "Passou do prazo e não dá para confirmar se salvou. Salvar de novo é seguro: se já tinha salvo, o painel reconhece.",
      );
    }

    return falha("indisponivel", "Não consegui falar com o banco. Nada foi salvo — seu texto continua aqui.");
  }

  registrar("error", "acao.erro_inesperado", { tipo: erro instanceof Error ? erro.name : "desconhecido" });

  return falha("indisponivel", "Algo deu errado. Nada foi salvo — seu texto continua aqui.");
}

/**
 * Núcleo das edições: sessão → validação → escrita condicionada à versão.
 * `montar` valida o que é específico de cada ação e devolve os campos, ou uma
 * mensagem de erro.
 */
async function editar(
  entrada: unknown,
  montar: (e: Record<string, unknown>) => CamposAtualizacao | string,
): Promise<ResultadoEdicao> {
  // Sem redirect aqui de propósito: expirou a sessão no meio da edição, o
  // texto digitado NÃO pode ser perdido por uma navegação para o login.
  let ativa: boolean;

  try {
    ativa = await validarSessao();
  } catch (erro) {
    // Não deu para VERIFICAR a sessão (banco fora do ar): falha fechada, mas com
    // a mensagem certa — não é "sessão expirada".
    return tratarErro(erro);
  }

  if (!ativa) {
    return falha("sessao", "Sua sessão expirou. Seu texto está preservado nesta tela.");
  }

  const e = typeof entrada === "object" && entrada !== null ? (entrada as Record<string, unknown>) : {};

  if (!ehUuid(e.id) || !ehVersao(e.versao)) return falha("validacao", "Pedido inválido.");

  const campos = montar(e);
  if (typeof campos === "string") return falha("validacao", campos);

  try {
    const resultado = await atualizarLead(e.id, e.versao, campos);

    if (resultado.ok) return { ok: true, atual: camposEditaveis(resultado.lead) };

    if (resultado.motivo === "conflito") {
      return {
        ok: false,
        motivo: "conflito",
        atual: camposEditaveis(resultado.atual),
        mensagem: "Este lead foi alterado em outro lugar desde que você abriu.",
      };
    }

    return falha("nao_encontrado", "Este lead não existe mais.");
  } catch (erro) {
    return tratarErro(erro);
  }
}

export async function mudarStatus(entrada: unknown): Promise<ResultadoEdicao> {
  return editar(entrada, (e) => (ehStatus(e.status) ? { status: e.status } : "Status inválido."));
}

export async function salvarObservacoes(entrada: unknown): Promise<ResultadoEdicao> {
  return editar(entrada, (e) => {
    if (typeof e.observacoes !== "string") return "Texto inválido.";

    return validarObservacoes(e.observacoes) ?? { observacoes: e.observacoes };
  });
}

/** `quando` vem de um <input type="datetime-local">; vazio limpa o retorno. */
export async function salvarRetorno(entrada: unknown): Promise<ResultadoEdicao> {
  return editar(entrada, (e) => {
    const texto = typeof e.texto === "string" ? e.texto : "";
    const erroTexto = validarProximaAcao(texto);
    if (erroTexto) return erroTexto;

    if (e.quando === null || e.quando === "") {
      return { proxima_acao_em: null, proxima_acao: null };
    }

    const iso = localParaIso(e.quando);
    if (!iso) return "Data e hora inválidas.";

    return { proxima_acao_em: iso, proxima_acao: texto };
  });
}

export async function definirNaoContatar(entrada: unknown): Promise<ResultadoEdicao> {
  return editar(entrada, (e) =>
    typeof e.ativo === "boolean"
      ? { nao_contatar_em: e.ativo ? new Date().toISOString() : null }
      : "Pedido inválido.",
  );
}

// ── Lista: busca e novidades ─────────────────────────────────────────────

const filtroValido = (v: unknown) => (ehStatus(v) || v === "retornos" ? String(v) : null);

/**
 * O termo da busca fica num cookie, NÃO na URL.
 *
 * Quem busca digita nome e telefone de uma pessoa. Na URL, isso iria para o
 * histórico do navegador e para o log de acesso da hospedagem. O cookie é
 * httpOnly, SameSite=Strict (não acompanha link vindo de fora) e expira em 1h.
 * Os filtros (status, página) não são sensíveis e continuam na URL.
 */
export async function definirBusca(formData: FormData) {
  if (!(await sessaoAtiva())) redirect("/login");

  const termo = sanitizarBusca(formData.get("busca"));
  const status = filtroValido(formData.get("status"));
  const armazem = await cookies();

  if (termo) {
    armazem.set(NOME_COOKIE_BUSCA, termo, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: 60 * 60,
    });
  } else {
    armazem.delete(NOME_COOKIE_BUSCA);
  }

  redirect(status ? `/?status=${status}` : "/");
}

export async function limparBusca(formData: FormData) {
  if (!(await sessaoAtiva())) redirect("/login");

  (await cookies()).delete(NOME_COOKIE_BUSCA);

  const status = filtroValido(formData.get("status"));

  redirect(status ? `/?status=${status}` : "/");
}

/**
 * Total de leads, para o aviso "há novos leads". Devolve null em qualquer
 * falha: o aviso é conveniência e não pode quebrar a tela.
 */
export async function totalDeLeads(): Promise<number | null> {
  if (!(await sessaoAtiva())) return null;

  try {
    return (await contagens()).total;
  } catch (erro) {
    unstable_rethrow(erro);

    return null;
  }
}
