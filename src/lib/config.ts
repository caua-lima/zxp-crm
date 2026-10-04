import "server-only";

import { ErroConfiguracao } from "./erros";

/**
 * Configuração do servidor, validada.
 *
 * Falha FECHADA: variável ausente ou inválida lança ErroConfiguracao em vez de
 * seguir com um valor fraco. A mensagem lista só os NOMES dos campos com
 * problema — nunca o valor, que pode ser a chave do banco ou a senha.
 *
 * Nenhuma destas variáveis tem prefixo NEXT_PUBLIC_, e isso é essencial: esse
 * prefixo embute o valor no JavaScript que o navegador baixa. (A regra vale
 * para ESTES segredos. Um ID público de analytics, por exemplo, não é segredo —
 * mas este painel não tem nenhum, e não deve ter.)
 */

export type Configuracao = {
  supabaseUrl: string;
  chaveBanco: string;
  senhaAdmin: string;
  segredo: string;
};

/** Valores de exemplo que alguém pode ter esquecido de trocar. */
const PLACEHOLDERS_SENHA = ["trocar-esta-senha-no-deploy", "changeme", "senha", "admin", "password"];

function producao() {
  return process.env.NODE_ENV === "production";
}

/** Decodifica o payload (sem verificar assinatura) só para descobrir o papel da chave. */
function papelDaChave(chave: string): string | null {
  const partes = chave.split(".");
  if (partes.length !== 3) return null;

  try {
    const payload = JSON.parse(Buffer.from(partes[1], "base64url").toString("utf8")) as {
      role?: unknown;
    };

    return typeof payload.role === "string" ? payload.role : null;
  } catch {
    return null;
  }
}

export function validarConfiguracao(env: NodeJS.ProcessEnv = process.env): Configuracao {
  const problemas: string[] = [];

  // ── SUPABASE_URL ──────────────────────────────────────────────────────
  let supabaseUrl = (env.SUPABASE_URL ?? "").trim();

  if (!supabaseUrl) {
    problemas.push("SUPABASE_URL ausente");
  } else {
    try {
      const url = new URL(supabaseUrl);
      const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);

      // http só para loopback (testes e simulação local): esse tráfego não sai
      // da máquina. Qualquer host remoto exige https, em qualquer ambiente.
      if (url.protocol !== "https:" && !local) {
        problemas.push("SUPABASE_URL deve usar https");
      }

      // Erro clássico: colar o endpoint REST (…/rest/v1/) em vez da raiz do projeto.
      if (url.pathname !== "/" || url.search || url.hash) {
        problemas.push("SUPABASE_URL deve ser só a raiz do projeto, sem /rest/v1/");
      }

      supabaseUrl = url.origin;
    } catch {
      problemas.push("SUPABASE_URL não é uma URL válida");
    }
  }

  // ── SUPABASE_SERVICE_ROLE_KEY ─────────────────────────────────────────
  const chaveBanco = (env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();

  if (!chaveBanco) {
    problemas.push("SUPABASE_SERVICE_ROLE_KEY ausente");
  } else if (chaveBanco.length < 20) {
    problemas.push("SUPABASE_SERVICE_ROLE_KEY curta demais");
  } else if (
    chaveBanco.startsWith("sb_publishable_") ||
    papelDaChave(chaveBanco) === "anon"
  ) {
    // Com RLS ligado e sem policy, a chave pública não lê nada: o painel
    // abriria vazio, sem explicar por quê. Melhor recusar de cara.
    problemas.push("SUPABASE_SERVICE_ROLE_KEY é uma chave PÚBLICA (anon/publishable); use a secreta");
  }

  // ── ADMIN_PASSWORD ────────────────────────────────────────────────────
  const senhaAdmin = env.ADMIN_PASSWORD ?? "";

  if (!senhaAdmin) {
    problemas.push("ADMIN_PASSWORD ausente");
  } else if (producao()) {
    if (senhaAdmin.length < 12) problemas.push("ADMIN_PASSWORD curta demais (mínimo 12 em produção)");
    if (PLACEHOLDERS_SENHA.includes(senhaAdmin.toLowerCase()) || /trocar/i.test(senhaAdmin)) {
      problemas.push("ADMIN_PASSWORD ainda é o valor de exemplo");
    }
  } else if (senhaAdmin.length < 8) {
    problemas.push("ADMIN_PASSWORD curta demais (mínimo 8)");
  }

  // ── AUTH_SECRET ───────────────────────────────────────────────────────
  const segredo = env.AUTH_SECRET ?? "";

  if (!segredo) {
    problemas.push("AUTH_SECRET ausente");
  } else if (segredo.length < 32) {
    problemas.push("AUTH_SECRET curto demais (mínimo 32 caracteres)");
  } else if (new Set(segredo).size < 12) {
    // Tamanho não prova entropia: "aaaa…" tem 32 caracteres e nenhuma força.
    problemas.push("AUTH_SECRET com pouca variação de caracteres; gere um aleatório");
  }

  if (problemas.length > 0) throw new ErroConfiguracao(problemas);

  return { supabaseUrl, chaveBanco, senhaAdmin, segredo };
}

export function configuracao(): Configuracao {
  return validarConfiguracao();
}
