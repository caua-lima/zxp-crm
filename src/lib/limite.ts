import "server-only";

/**
 * Freio de força bruta no login.
 *
 * A senha é única e o painel é o que separa um estranho do telefone e do
 * relato pessoal de adolescentes. Sem freio, uma senha fraca cai em minutos.
 *
 * LIMITAÇÃO CONHECIDA: o estado vive na memória do processo. Em serverless,
 * cada instância tem o seu, então o atacante ganha algumas tentativas a mais
 * por instância ativa. Isso derruba um script de dicionário, que é o ataque
 * real aqui; não derruba um adversário distribuído. Se um dia precisar disso,
 * o passo seguinte é uma tabela no Supabase — não uma dependência nova.
 */

type Tentativa = {
  falhas: number;
  /** Quando foi a última tentativa errada. É o que define o que é registro
   *  velho — usar `bloqueadoAte` aqui zeraria o contador de quem ainda não
   *  chegou no limite, e o freio nunca entraria. */
  ultimaFalhaEm: number;
  bloqueadoAte: number;
};

const tentativas = new Map<string, Tentativa>();

const FALHAS_LIVRES = 3;
const BLOQUEIO_BASE_MS = 30_000;
const BLOQUEIO_MAXIMO_MS = 15 * 60_000;
const ESQUECER_APOS_MS = 60 * 60_000;

/** Descarta quem não erra há uma hora, pra memória não crescer sem limite. */
function esquecerAntigos(agora: number) {
  for (const [chave, tentativa] of tentativas) {
    const inativo = agora - tentativa.ultimaFalhaEm > ESQUECER_APOS_MS;
    const desbloqueado = agora > tentativa.bloqueadoAte;

    if (inativo && desbloqueado) {
      tentativas.delete(chave);
    }
  }
}

/** Quanto tempo falta pra essa origem poder tentar de novo (0 = liberada). */
export function esperaRestanteMs(origem: string) {
  const tentativa = tentativas.get(origem);
  if (!tentativa) return 0;

  return Math.max(0, tentativa.bloqueadoAte - Date.now());
}

export function registrarFalha(origem: string) {
  const agora = Date.now();
  esquecerAntigos(agora);

  const tentativa = tentativas.get(origem) ?? {
    falhas: 0,
    ultimaFalhaEm: agora,
    bloqueadoAte: 0,
  };

  tentativa.falhas += 1;
  tentativa.ultimaFalhaEm = agora;

  // As primeiras erradas passam: quem digita errado é quase sempre o dono.
  // Depois disso o tempo dobra a cada tentativa, até 15 minutos.
  if (tentativa.falhas > FALHAS_LIVRES) {
    const expoente = tentativa.falhas - FALHAS_LIVRES - 1;
    const espera = Math.min(
      BLOQUEIO_BASE_MS * 2 ** expoente,
      BLOQUEIO_MAXIMO_MS,
    );
    tentativa.bloqueadoAte = agora + espera;
  }

  tentativas.set(origem, tentativa);
}

export function limparTentativas(origem: string) {
  tentativas.delete(origem);
}

export function formatarEspera(ms: number) {
  const segundos = Math.ceil(ms / 1000);

  if (segundos < 60) return `${segundos} segundos`;

  return `${Math.ceil(segundos / 60)} minutos`;
}
