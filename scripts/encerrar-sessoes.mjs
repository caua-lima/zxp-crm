/**
 * Encerra TODAS as sessões abertas do painel, de fora dele.
 *
 *   npm run sessoes:encerrar
 *
 * Quando usar: perdeu ou emprestou um aparelho e não consegue (ou não quer)
 * abrir o painel para clicar em "Sair de todos os aparelhos"; suspeita que
 * alguém copiou um cookie; ou acabou de trocar a senha e quer garantir.
 *
 * Trocar ADMIN_PASSWORD na Vercel TAMBÉM derruba todas as sessões (cada sessão
 * guarda uma impressão digital da senha), mas só depois do próximo deploy. Este
 * script age na hora.
 *
 * Lê SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY do .env.local. Não imprime
 * nenhum valor secreto.
 */

const url = (process.env.SUPABASE_URL ?? "").replace(/\/+$/, "");
const chave = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

if (!url || !chave) {
  console.error("Faltam SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY (use o .env.local: `npm run sessoes:encerrar`).");
  process.exit(1);
}

if (!url.startsWith("https://") && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(url)) {
  console.error("SUPABASE_URL precisa ser https (http só é aceito para localhost).");
  process.exit(1);
}

try {
  const resposta = await fetch(`${url}/rest/v1/crm_sessoes?revogada_em=is.null`, {
    method: "PATCH",
    signal: AbortSignal.timeout(10_000),
    headers: {
      apikey: chave,
      Authorization: `Bearer ${chave}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify({ revogada_em: new Date().toISOString() }),
  });

  if (!resposta.ok) {
    // Só o status: o corpo da resposta não é impresso.
    console.error(`O banco recusou (HTTP ${resposta.status}). Confira a chave e se a migration crm_0001 foi aplicada.`);
    process.exit(1);
  }

  const linhas = await resposta.json();

  console.log(
    linhas.length === 0
      ? "Nenhuma sessão aberta. Nada a encerrar."
      : `${linhas.length} sessão(ões) encerrada(s). Todos os aparelhos precisarão entrar de novo.`,
  );
} catch (erro) {
  console.error(`Não consegui falar com o banco (${erro instanceof Error ? erro.name : "erro"}).`);
  process.exit(1);
}
