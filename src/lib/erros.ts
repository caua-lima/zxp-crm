/**
 * Erros tipados do painel.
 *
 * A mensagem de um ErroCrm é SEMPRE fixa e segura: nunca carrega o corpo da
 * resposta do banco (que pode trazer o valor da linha — nome, telefone,
 * relato), senha, cookie ou chave. Quem precisa do detalhe operacional lê o
 * log estruturado (categoria, operação, status, código, correlação).
 */

export type CategoriaErro =
  /** Banco fora do ar, projeto pausado, rede. */
  | "indisponivel"
  /** Passou do prazo. Numa escrita, o resultado é INCERTO — pode ter gravado. */
  | "timeout"
  | "nao_encontrado"
  /** Alguém alterou o registro desde que a tela o leu. */
  | "conflito"
  | "validacao"
  /** Variável de ambiente ausente ou inválida. */
  | "configuracao"
  /** O banco não tem as colunas/funções que este código espera (migration pendente). */
  | "schema_desatualizado"
  /** O banco respondeu algo inesperado. */
  | "upstream"
  | "sessao";

const MENSAGENS: Record<CategoriaErro, string> = {
  indisponivel: "O banco de dados não respondeu.",
  timeout: "O banco de dados demorou demais para responder.",
  nao_encontrado: "Registro não encontrado.",
  conflito: "O registro foi alterado em outro lugar.",
  validacao: "Dados inválidos.",
  configuracao: "Configuração do painel incompleta.",
  schema_desatualizado: "O banco de dados está desatualizado em relação ao painel.",
  upstream: "Resposta inesperada do banco de dados.",
  sessao: "Sessão inválida ou expirada.",
};

export class ErroCrm extends Error {
  readonly categoria: CategoriaErro;
  readonly operacao: string;
  readonly status?: number;
  readonly codigo?: string;
  readonly correlacao?: string;
  /** Escrita que estourou o prazo: pode ter sido gravada. Nunca repetir às cegas. */
  readonly incerto: boolean;

  constructor(
    categoria: CategoriaErro,
    operacao: string,
    extra: { status?: number; codigo?: string; correlacao?: string; incerto?: boolean } = {},
  ) {
    super(MENSAGENS[categoria]);
    this.name = "ErroCrm";
    this.categoria = categoria;
    this.operacao = operacao;
    this.status = extra.status;
    this.codigo = extra.codigo;
    this.correlacao = extra.correlacao;
    this.incerto = extra.incerto ?? false;
  }
}

/** Erro de configuração: lista só os NOMES das variáveis com problema, nunca valores. */
export class ErroConfiguracao extends ErroCrm {
  readonly problemas: string[];

  constructor(problemas: string[]) {
    super("configuracao", "configuracao");
    this.name = "ErroConfiguracao";
    this.problemas = problemas;
  }
}

export function ehErroCrm(erro: unknown): erro is ErroCrm {
  return erro instanceof ErroCrm;
}
