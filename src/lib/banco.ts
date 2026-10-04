import "server-only";

import { configuracao } from "./config";
import { ErroCrm, type CategoriaErro } from "./erros";
import { novaCorrelacao, registrar } from "./log";

/**
 * Único ponto de saída do painel para o Supabase (PostgREST).
 *
 * O que ele garante, e por que importa:
 *  - PRAZO em toda chamada. Sem ele, um banco travado prende a tela até o
 *    limite da plataforma, sem erro classificável.
 *  - Erros TIPADOS, com mensagem fixa. O corpo da resposta nunca é copiado
 *    para o erro nem para o log — ele pode trazer o valor da linha (nome,
 *    telefone, relato).
 *  - Leitura pode ser repetida uma vez. ESCRITA NUNCA: um timeout pode ter
 *    acontecido DEPOIS de gravar, e repetir às cegas duplicaria ou mascararia
 *    um conflito. O controle de versão é o que torna o "tentar de novo" seguro.
 */

const PRAZO_PADRAO_MS = 8000;

function prazoMs(): number {
  const valor = Number(process.env.CRM_PRAZO_BANCO_MS);

  return Number.isInteger(valor) && valor >= 100 && valor <= 30_000 ? valor : PRAZO_PADRAO_MS;
}

export type OpcoesBanco = {
  metodo?: "GET" | "HEAD" | "POST" | "PATCH" | "DELETE";
  corpo?: unknown;
  /** Valor do cabeçalho Prefer (ex.: "return=representation"). */
  preferir?: string;
};

/** Códigos do Postgres/PostgREST que significam "o banco não tem o que este código espera". */
const CODIGOS_SCHEMA = new Set(["42703", "42P01", "42883", "PGRST202", "PGRST204", "PGRST205"]);
/** Códigos de entrada inválida (ex.: uuid mal formado, timestamp inválido). */
const CODIGOS_VALIDACAO = new Set(["22P02", "22007", "22008", "23514", "22001"]);

async function codigoDoErro(resposta: Response): Promise<string | undefined> {
  try {
    const dados = (await resposta.json()) as { code?: unknown };

    // O código é curto e estruturado; qualquer outra coisa é descartada.
    return typeof dados.code === "string" && /^[A-Za-z0-9_]{3,12}$/.test(dados.code)
      ? dados.code
      : undefined;
  } catch {
    return undefined;
  }
}

function categoriaDe(status: number, codigo?: string): CategoriaErro {
  // 401/403: o banco recusou a credencial do servidor. É configuração, não
  // culpa do visitante.
  if (status === 401 || status === 403) return "configuracao";
  if (codigo && CODIGOS_SCHEMA.has(codigo)) return "schema_desatualizado";
  if (codigo && CODIGOS_VALIDACAO.has(codigo)) return "validacao";
  // 5xx e os 52x do Cloudflare (521 = projeto pausado/fora do ar).
  if (status >= 500) return "indisponivel";

  return "upstream";
}

type Tentativa =
  | { resposta: Response }
  | { erro: ErroCrm; repetivel: boolean };

async function tentar(
  operacao: string,
  caminho: string,
  opcoes: OpcoesBanco,
  correlacao: string,
  leitura: boolean,
): Promise<Tentativa> {
  const cfg = configuracao();
  const inicio = Date.now();

  let resposta: Response;

  try {
    resposta = await fetch(`${cfg.supabaseUrl}/rest/v1/${caminho}`, {
      method: opcoes.metodo ?? "GET",
      // Painel de leads: dado velho aqui é pior que uma requisição a mais.
      cache: "no-store",
      signal: AbortSignal.timeout(prazoMs()),
      headers: {
        apikey: cfg.chaveBanco,
        Authorization: `Bearer ${cfg.chaveBanco}`,
        "Content-Type": "application/json",
        ...(opcoes.preferir ? { Prefer: opcoes.preferir } : {}),
      },
      body: opcoes.corpo === undefined ? undefined : JSON.stringify(opcoes.corpo),
    });
  } catch (causa) {
    const estourou =
      causa instanceof Error && (causa.name === "TimeoutError" || causa.name === "AbortError");
    const categoria: CategoriaErro = estourou ? "timeout" : "indisponivel";

    registrar("error", "banco.falha", {
      operacao,
      categoria,
      duracao_ms: Date.now() - inicio,
      correlacao,
    });

    return {
      erro: new ErroCrm(categoria, operacao, {
        correlacao,
        incerto: estourou && !leitura,
      }),
      repetivel: true,
    };
  }

  if (resposta.ok) {
    const duracao = Date.now() - inicio;
    if (duracao > 2500) {
      registrar("warn", "banco.lento", { operacao, duracao_ms: duracao, correlacao });
    }

    return { resposta };
  }

  const codigo = await codigoDoErro(resposta);
  const categoria = categoriaDe(resposta.status, codigo);

  registrar("error", "banco.erro", {
    operacao,
    status: resposta.status,
    categoria,
    codigo,
    duracao_ms: Date.now() - inicio,
    correlacao,
  });

  return {
    erro: new ErroCrm(categoria, operacao, { status: resposta.status, codigo, correlacao }),
    repetivel: [502, 503, 504].includes(resposta.status),
  };
}

/**
 * Chama o PostgREST. Devolve a Response (ok) ou lança ErroCrm.
 * `caminho` é relativo a /rest/v1/ e já deve estar codificado.
 */
export async function bancoFetch(
  operacao: string,
  caminho: string,
  opcoes: OpcoesBanco = {},
): Promise<Response> {
  const metodo = opcoes.metodo ?? "GET";
  const leitura = metodo === "GET" || metodo === "HEAD";
  const correlacao = novaCorrelacao();
  const maximo = leitura ? 2 : 1;

  let ultimo: ErroCrm | null = null;

  for (let n = 1; n <= maximo; n++) {
    const resultado = await tentar(operacao, caminho, opcoes, correlacao, leitura);

    if ("resposta" in resultado) return resultado.resposta;

    ultimo = resultado.erro;
    if (!resultado.repetivel) break;
  }

  throw ultimo as ErroCrm;
}

/** Lê o JSON de uma resposta ok; qualquer coisa fora disso é ErroCrm('upstream'). */
export async function lerJson<T = unknown>(resposta: Response, operacao: string): Promise<T> {
  try {
    return (await resposta.json()) as T;
  } catch {
    registrar("error", "banco.json_invalido", { operacao, status: resposta.status });

    throw new ErroCrm("upstream", operacao, { status: resposta.status });
  }
}

/** Chama uma função do banco (RPC). Funções `void` voltam sem corpo. */
export async function rpc<T = unknown>(nome: string, argumentos: Record<string, unknown>) {
  const operacao = `rpc.${nome}`;
  const resposta = await bancoFetch(operacao, `rpc/${nome}`, {
    metodo: "POST",
    corpo: argumentos,
  });

  const texto = await resposta.text();
  if (!texto) return null as T;

  try {
    return JSON.parse(texto) as T;
  } catch {
    throw new ErroCrm("upstream", operacao, { status: resposta.status });
  }
}
