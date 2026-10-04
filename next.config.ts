import type { NextConfig } from "next";

/**
 * Cabeçalhos de defesa em profundidade, em TODA resposta (inclusive arquivos
 * estáticos). A CSP fica no proxy.ts porque precisa de um nonce novo a cada
 * requisição — cabeçalho estático não consegue isso.
 *
 * Nenhum destes é "segurança absoluta"; cada um fecha uma porta específica.
 */
const cabecalhos = [
  // Nenhum site pode embutir o painel num <iframe> (clickjacking). Reforça o
  // `frame-ancestors 'none'` da CSP em navegadores mais antigos.
  { key: "X-Frame-Options", value: "DENY" },
  // O navegador não "adivinha" o tipo do arquivo (MIME sniffing).
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Nada do painel vaza para sites externos (o link do WhatsApp não leva o
  // endereço de volta). NÃO usar "no-referrer": com ele o navegador manda
  // `Origin: null` até em formulário para o PRÓPRIO site, e o Next recusa a
  // Server Action ("Invalid Server Actions request") — busca e login quebrariam
  // antes da hidratação ou sem JavaScript. "same-origin" protege igual.
  { key: "Referrer-Policy", value: "same-origin" },
  // Painel não usa câmera, microfone, localização, pagamento nem USB.
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
  },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

const nextConfig: NextConfig = {
  // Não anuncia "X-Powered-By: Next.js".
  poweredByHeader: false,

  async headers() {
    return [{ source: "/:path*", headers: cabecalhos }];
  },
};

export default nextConfig;
