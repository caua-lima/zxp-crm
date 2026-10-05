# Operação

Como manter o painel de pé e seguro depois de publicado. Para configurar do
zero, veja [CONFIGURACAO.md](CONFIGURACAO.md).

## Ambientes

| Ambiente | Banco | Dados | Observação |
| --- | --- | --- | --- |
| **Produção** (Vercel, `main`) | Supabase real | Pessoas de verdade, inclusive menores | Variáveis cadastradas **só em Production** |
| **Preview** (Vercel, branches) | **Nenhum** | — | Sem variáveis, sobe e mostra "O painel não está configurado". Mantenha a proteção de deploy ligada |
| **Local simulado** | Em memória (`npm run banco:simulado`) | Fictícios | Para ver a tela e rodar testes. **Nunca** aponte testes para o banco real |

Regra de ouro: **teste automatizado nunca usa o banco real.** Os testes de banco
rodam o SQL num Postgres embutido (pglite); os de integração, num banco simulado.

## Trocar a senha do painel

1. Vercel → Settings → Environment Variables → edite `ADMIN_PASSWORD`
   (≥ 12 caracteres, única, no gerenciador de senhas).
2. **Redeploy** (variável nova não entra em deploy já existente).

Efeito: **todas as sessões abertas morrem** — cada sessão guarda uma impressão
digital da senha, então a troca as invalida sozinha. Você entra de novo com a
senha nova.

Se esqueceu a senha: não existe "esqueci minha senha" (é de propósito: não há
e-mail nem cadastro para um estranho explorar). Quem é dono do projeto na Vercel
simplesmente cadastra uma nova e faz redeploy.

## Encerrar sessões (perdeu um aparelho, suspeita de cookie copiado)

O cookie de sessão **é uma credencial**: quem o copiar entra até ele expirar (7
dias) ou ser revogado. Três jeitos de revogar:

| Jeito | Quando | Efeito |
| --- | --- | --- |
| Menu **Conta → Sair deste aparelho** | Uso normal | Revoga a sessão deste aparelho **no servidor** (uma cópia do cookie também morre) |
| Menu **Conta → Sair de todos os aparelhos** | Perdeu/emprestou um aparelho | Revoga todas, na hora |
| `npm run sessoes:encerrar` (precisa do `.env.local`) | Não consegue abrir o painel | Revoga todas, na hora, de fora |

Se o logout avisar que "não conseguiu encerrar a sessão no servidor", o banco
estava fora do ar: depois que voltar, use "Sair de todos os aparelhos".

## Rotacionar credenciais

| O quê | Como | Efeito colateral |
| --- | --- | --- |
| Chave do banco (`SUPABASE_SERVICE_ROLE_KEY`) | Supabase → API Keys → **Create new secret key** → atualize na Vercel (e na LP) → redeploy **dos dois** → só então **revogue a antiga** | Revogar antes de atualizar derruba a captação da LP |
| `AUTH_SECRET` | Gere outro, atualize, redeploy | Derruba todas as sessões e zera os bloqueios de login |
| `ADMIN_PASSWORD` | Ver acima | Derruba todas as sessões |

A chave do banco **nunca deve passar por chat, e-mail ou print.** Cole direto
no campo da Vercel e do `.env.local`. Uma chave que já passou por lugar indevido
deve ser considerada comprometida: revogue.

## Backup e restauração

> **Não foi verificado nem testado nesta revisão.** Não tive acesso ao seu
> projeto Supabase. O que segue é o que você precisa conferir — não afirmo que já
> está resolvido.

1. Supabase → **Database → Backups**: veja o que **o seu plano** oferece
   (frequência e retenção). Não presuma.
2. Se o plano não inclui backup, ou se você quer uma cópia própria: **Table
   Editor → `leads` → Export → CSV**. O arquivo tem dados pessoais de menores:
   guarde criptografado, em pasta restrita, e apague o que não precisar.
3. **Faça um teste de restauração** uma vez, num projeto Supabase *separado*.
   Backup que nunca foi restaurado é uma esperança, não um backup.

## Rollback

**Código (instantâneo):** Vercel → Deployments → o deploy anterior → **⋯ →
Promote to Production**. Não mexe no banco.

**Banco (destrutivo):** [`supabase/rollback/crm_0001_rollback.sql`](../supabase/rollback/crm_0001_rollback.sql).
Reverta o código **antes** (ele depende das colunas). Apaga histórico, sessões,
retornos e "não contatar" — exporte o que quiser guardar. Não toca nas colunas da
LP nem apaga lead.

## O que o Supabase gratuito faz com o projeto

O plano gratuito **pausa o projeto depois de um período sem atividade**. Já
aconteceu duas vezes neste projeto. Efeito:

- a **captação da LP para** (quem preenche o formulário recebe erro e o cadastro
  se perde);
- o painel mostra "Não foi possível carregar" e o login diz "Não consegui
  verificar o acesso agora" (falha **fechada**, de propósito).

Para religar: Supabase → o projeto → **Restore**; leva 1 a 3 minutos.

**Decisão sua, antes de divulgar a LP:** plano pago (não pausa), ou aceitar o
risco e abrir o painel pelo menos uma vez por semana. Esta revisão **não**
adiciona rotina automática de "manter acordado" — seria uma automação nova, com
credencial, que você não pediu.

## Observabilidade

Não há painel de métricas nem alertas configurados. O que existe são **logs
estruturados** (Vercel → Logs), uma linha JSON por evento, **sem dado pessoal**:

| `evento` | Significa | Ação |
| --- | --- | --- |
| `banco.erro` | O banco respondeu erro. Veja `categoria`, `status`, `codigo` | `schema_desatualizado` → aplicar migration; `configuracao` + `401` → chave errada/revogada |
| `banco.falha` | Não conseguiu falar com o banco (`timeout`/`indisponivel`) | Ver se o projeto está pausado |
| `banco.lento` | Chamada passou de 2,5 s | Acompanhar |
| `login.configuracao_invalida` | Variável ausente/fraca (lista **nomes**) | Corrigir na Vercel |
| `login.freio_indisponivel` | Não deu para consultar o contador: login recusado | Ver banco |
| `sessao.validacao_falhou` | Não deu para validar a sessão | Ver banco |
| `lead.linhas_ignoradas` | Linhas do banco sem id válido | Investigar dado |
| `lead.atualizacao_multipla` | **Grave**: um UPDATE por `id` mexeu em mais de uma linha | Investigar já |

Se quiser alerta, configure na Vercel (Log Drains / Observability) um aviso para
`banco.falha` repetido e `login.freio_indisponivel`. **Não está feito.**
Não adicione pixel de marketing nem gravação de sessão ao painel.

## IP de quem tenta entrar (freio de login)

O freio usa o IP vindo de `x-vercel-forwarded-for`, `x-real-ip` ou
`x-forwarded-for`. **Na Vercel** esses cabeçalhos são definidos pela plataforma e
o cliente não consegue forjá-los. **Fora da Vercel** (servidor próprio), só é
seguro se o seu proxy **sobrescrever** esses cabeçalhos — senão quem ataca troca
o IP falso a cada tentativa e escapa do bloqueio.

## CSP: saída de emergência

A política de segurança de conteúdo é aplicada no `src/proxy.ts`, com nonce por
requisição, e foi verificada num build de produção local (a página hidrata sem
violação). Se, depois de um deploy, a tela ficar sem reagir (formulário que não
envia, botão morto) e o console do navegador mostrar `Refused to execute…`:

1. Vercel → adicione `CSP_REPORT_ONLY=1` → redeploy. A política passa a só
   **reportar**, sem bloquear.
2. Corrija a causa, remova a variável, redeploy.

Isso é um alívio temporário, não uma configuração para ficar.

## Limites conhecidos

- **Senha única e compartilhada.** Sem identidade individual nem registro de
  *quem* fez cada alteração. Se entrar mais alguém na equipe, isso deixa de ser
  aceitável: o passo seguinte é autenticação individual com auditoria de autor.
- **Botnet.** O freio é por origem. Um atacante com milhares de IPs soma
  tentativas livres por IP. A defesa real contra isso é senha longa e única.
- **A credencial do banco é a `service_role`**, que contorna RLS. O painel a usa
  no servidor, atrás da DAL. Reduzir esse alcance (papel restrito ou funções
  específicas) é possível e **não foi feito**; a defesa hoje é a DAL e a
  validação de toda entrada.
- **Botão "voltar" do navegador** não é interceptado pela proteção de saída com
  anotação não salva (não há API confiável para isso). Fechar a aba, recarregar,
  clicar em links e sair **são** protegidos.
- **Busca**: o termo fica num cookie de 1 hora, não na URL. Filtro e página
  ficam na URL (não são sensíveis).
- Os índices de paginação foram criados com `if not exists` **sem eu ter lido o
  banco real**. Se já existirem equivalentes, ficam redundantes — sem dano.

## O que os testes provam e o que não provam

| Camada | Como roda | Prova | **Não** prova |
| --- | --- | --- | --- |
| `tests/db` | O SQL real num Postgres embutido (pglite) | A migration roda, é idempotente, preserva leads, os gatilhos funcionam, as permissões negam as chaves públicas, o rollback funciona | Comportamento do **Supabase real** (PostgREST, RLS publicado, plano) e concorrência real (uma conexão só) |
| `tests/integracao` | Banco **simulado** que fala o subconjunto de PostgREST usado | A lógica do painel: sessão, login, versão, paginação, falhas, logs sem dado pessoal | Que o Supabase real entende as mesmas consultas (a sintaxe foi conferida na documentação oficial do PostgREST, **não** executada contra o serviço) |
| `tests/ui` | jsdom | Rascunho, conflito, exclusão mútua, proteção de saída | Renderização real, teclado, leitor de tela |
| `tests/unit` | Funções puras | Telefone, datas, saneamento, CSP, contraste | — |
| Verificação manual | Chromium (painel do app), build de produção, banco simulado | Fluxos de lista, detalhe, edição, conflito, busca, revogação e CSP real | Desktop, 320 px, zoom 200 %, teclado e leitor de tela **não foram verificados** (o painel do navegador ficou oculto); Lighthouse **não** foi rodado |

**Nenhum teste automatizado foi executado contra o Supabase real nem contra a
publicação na Vercel.** Por isso o teste de fumaça de
[CONFIGURACAO.md](CONFIGURACAO.md#6-teste-de-fumaça-depois-de-cada-deploy) existe:
é o que fecha essa lacuna.

## Dependências

`npm audit --omit=dev` (o que roda em produção) reporta **0** vulnerabilidades.
O `npm audit` completo reporta 6 de severidade alta, **todos** na cadeia de
globbing do ESLint (`brace-expansion`, `braces`, `micromatch`, `fast-glob`).
Afetam só lint/CI — não vão para produção. A correção automática sugerida pelo npm
é um **downgrade** para `eslint-config-next@14`; **não a aplique** e **não use
`npm audit fix --force`**. Reavalie quando o `eslint-config-next` publicar versão
com a cadeia corrigida. O Dependabot (`.github/dependabot.yml`) abre as
atualizações para revisão.
