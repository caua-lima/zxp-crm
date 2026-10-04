/**
 * Marca do painel e da oferta que ele atende — fonte única.
 *
 * Nada aqui é segredo (pode ser importado por cliente e servidor). O nome da
 * oferta acompanha a LP: ela passou de "RUMO" para "ZXP Direciona", e este é o
 * único lugar do CRM que precisa mudar se o nome mudar de novo. Não troque
 * strings espalhadas pelo código: o texto do WhatsApp, o título e o cabeçalho
 * saem daqui.
 */
export const marca = {
  /** Nome do painel (a ferramenta). */
  produto: "ZXP CRM",
  /** Nome da oferta cujos leads o painel atende — o mesmo da landing page. */
  oferta: "ZXP Direciona",
  empresaMae: "ZXP Solutions",
} as const;

/**
 * Primeira mensagem do WhatsApp. Fica aqui (e não na tela) para o texto ser
 * revisado num lugar só. Usa "conversa" porque é como a LP chama o primeiro
 * contato gratuito.
 */
export function mensagemWhatsapp(primeiroNome: string) {
  return `Oi, ${primeiroNome}! Aqui é da ${marca.oferta}. Vi seu cadastro e quero combinar nossa conversa de diagnóstico.`;
}
