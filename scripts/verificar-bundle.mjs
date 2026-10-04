/**
 * Confere que NENHUM segredo foi parar nos arquivos que o navegador baixa.
 *
 *   npm run build && npm run verificar:bundle
 *
 * Precisa das mesmas variáveis do build (valores de teste servem — o que
 * importa é provar que ESSES valores não aparecem no cliente). Falha com
 * código 1 se achar algum, ou se alguma variável não estiver definida (um
 * teste com valor vazio "passaria" sempre, o que seria enganoso).
 *
 * O que verifica:
 *  1. o VALOR de cada segredo não aparece em `.next/static` (o que vai ao navegador);
 *  3. padrões de chave do Supabase (sb_secret_…, JWT com role service_role);
 *  2. nenhum segredo é exposto por variável NEXT_PUBLIC_ (no código ou no build).
 *
 * O que NÃO verifica: o histórico do Git, os logs da hospedagem, nem o que o
 * servidor devolve em resposta a uma requisição.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const SEGREDOS = ["SUPABASE_SERVICE_ROLE_KEY", "ADMIN_PASSWORD", "AUTH_SECRET"];
const raiz = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

function arquivos(dir) {
  return readdirSync(dir).flatMap((nome) => {
    const caminho = join(dir, nome);

    return statSync(caminho).isDirectory() ? arquivos(caminho) : [caminho];
  });
}

const problemas = [];

const ausentes = SEGREDOS.filter((n) => !process.env[n] || process.env[n].length < 8);
if (ausentes.length > 0) {
  console.error(`Defina estas variáveis (valores de teste servem) antes de rodar: ${ausentes.join(", ")}`);
  process.exit(1);
}

let estaticos;
try {
  estaticos = arquivos(join(raiz, ".next", "static"));
} catch {
  console.error("Não achei .next/static. Rode `npm run build` primeiro.");
  process.exit(1);
}

for (const arquivo of estaticos) {
  if (!/\.(js|css|html|json|txt|map)$/.test(arquivo)) continue;

  const conteudo = readFileSync(arquivo, "utf8");
  const nome = arquivo.slice(raiz.length);

  for (const segredo of SEGREDOS) {
    if (conteudo.includes(process.env[segredo])) problemas.push(`${nome}: contém o valor de ${segredo}`);
    if (conteudo.includes(segredo) && /process\.env/.test(conteudo)) {
      // O NOME da variável aparecendo junto de process.env no cliente indicaria leitura no navegador.
      problemas.push(`${nome}: o cliente lê ${segredo} de process.env`);
    }
  }

  if (/sb_secret_[A-Za-z0-9_-]{10,}/.test(conteudo)) problemas.push(`${nome}: tem uma chave sb_secret_…`);

  for (const m of conteudo.matchAll(/eyJ[A-Za-z0-9_-]{10,}\.([A-Za-z0-9_-]{10,})\.[A-Za-z0-9_-]{5,}/g)) {
    try {
      const payload = JSON.parse(Buffer.from(m[1], "base64url").toString("utf8"));
      if (payload.role === "service_role") problemas.push(`${nome}: tem um JWT com role service_role`);
    } catch {
      // não era um JWT: ignora
    }
  }
}

// Nenhum segredo pode ter prefixo NEXT_PUBLIC_ (isso o embute no navegador).
for (const arquivo of arquivos(join(raiz, "src"))) {
  const conteudo = readFileSync(arquivo, "utf8");

  for (const segredo of SEGREDOS) {
    if (conteudo.includes(`NEXT_PUBLIC_${segredo}`)) {
      problemas.push(`${arquivo.slice(raiz.length)}: NEXT_PUBLIC_${segredo}`);
    }
  }
}

if (problemas.length > 0) {
  console.error("SEGREDO NO CLIENTE:\n - " + problemas.join("\n - "));
  process.exit(1);
}

console.log(`OK: ${estaticos.length} arquivos do cliente verificados; nenhum segredo encontrado.`);
