# ZXP CRM — painel de leads da ZXP Direciona

Painel interno para atender quem se cadastra na landing page da ZXP Direciona
(mentoria individual de direção profissional, da ZXP Solutions).

Não é um CRM completo, e isso é uma decisão, não uma pendência: é uma lista de
leads, um detalhe por lead e um botão que abre o WhatsApp. Kanban arrastável,
automação de WhatsApp/e-mail, dashboard de métricas, multiusuário e exportação
em massa estão **fora de escopo** — é onde projeto assim morre antes de ser
usado, e cada um deles aumenta o estrago possível de um erro.

**Stack:** Next.js 16 (App Router) · TypeScript · Tailwind v4 · Supabase (via
PostgREST, sem SDK).

---

## Comece por aqui

| Quero… | Leia |
| --- | --- |
| Configurar do zero e publicar (**a ordem importa**) | [docs/CONFIGURACAO.md](docs/CONFIGURACAO.md) |
| Saber o que a LP e o CRM combinam sobre a tabela | [docs/CONTRATO-LP-CRM.md](docs/CONTRATO-LP-CRM.md) |
| Operar: trocar senha, revogar sessão, backup, rollback, o que fazer se cair | [docs/OPERACAO.md](docs/OPERACAO.md) |
| Ver o que a auditoria pediu e o que foi feito, item a item | [docs/AUDITORIA-2026-10.md](docs/AUDITORIA-2026-10.md) |

> ⚠️ **Antes de publicar este código, aplique a migration `crm_0001` no
> Supabase.** O painel inteiro — inclusive o login — depende dela (sessões,
> contador de tentativas, versão do registro). Sem ela ninguém consegue entrar.
> Passo a passo em [docs/CONFIGURACAO.md](docs/CONFIGURACAO.md).

## Como funciona

A landing page (repositório `zxp-direciona`) grava os cadastros na tabela
`leads` do Supabase. Este painel lê e edita **a mesma tabela, no mesmo projeto**
— não há sincronização, banco espelho nem API entre os dois. Um escreve, o
outro lê.

```
zxp-direciona ──INSERT──►  Supabase (tabela leads)  ◄──leitura/escrita──  zxp-crm
```

## Segurança

O painel lista **nome, telefone e um relato pessoal de adolescentes de 16 a 17
anos**. Isso define o nível de cuidado do projeto inteiro.

- **Sessão opaca e revogável.** O cookie guarda 32 bytes aleatórios; o banco
  guarda só o hash. Logout, troca de senha e "sair de todos os aparelhos" valem
  na hora — inclusive para uma *cópia* do cookie. O cookie **é** uma credencial.
- **Freio de força bruta persistente**, no banco: 3 erros livres, depois
  bloqueio de 30 s que dobra até 15 min, por origem (HMAC do IP, nunca o IP
  cru). Não se perde entre instâncias serverless. Se o banco cai, o login
  falha **fechado**.
- **Toda leitura e toda escrita passa por `exigirSessao()`** (`src/lib/auth.ts`),
  que consulta o banco. Isso não é redundância: Server Actions são endpoints POST
  alcançáveis por fora da interface. O `src/proxy.ts` só faz uma triagem
  otimista (o cookie existe?); quem autoriza é a DAL.
- **Escrita com controle de versão**: duas abas não sobrescrevem uma à outra em
  silêncio; o conflito mostra a versão do servidor e preserva o que você digitou.
- **Configuração validada, falha fechada**; erros tipados; log estruturado que
  **nunca** recebe corpo do banco, anotações, telefone, senha ou cookie.
- **CSP por nonce**, `X-Frame-Options`, `nosniff`, `Permissions-Policy`, `noindex`.
- A `service_role` **nunca chega ao navegador** (`npm run verificar:bundle`).
  A tabela segue com RLS ligado e nenhuma policy — **mas RLS não protege este
  painel**: a `service_role` contorna RLS por desenho. Quem protege é a DAL.

Limites conhecidos, ditos de propósito, estão em [docs/OPERACAO.md](docs/OPERACAO.md).

## Variáveis de ambiente

Copie `.env.example` para `.env.local`. As mesmas vão em **Vercel → Settings →
Environment Variables**. O painel recusa subir com valor ausente ou fraco.

| Variável | O que é |
| --- | --- |
| `SUPABASE_URL` | Raiz do projeto Supabase (a mesma da LP), sem `/rest/v1/` |
| `SUPABASE_SERVICE_ROLE_KEY` | Chave **secreta**. Nunca a publishable/anon |
| `ADMIN_PASSWORD` | Senha de entrada. Mínimo 12 caracteres em produção |
| `AUTH_SECRET` | Segredo interno. Mínimo 32 caracteres, com variação |

Nenhuma pode ter prefixo `NEXT_PUBLIC_`.

## Desenvolvimento

```bash
npm install
npm run dev -- --port 3001     # a LP costuma usar a 3000
```

### Ver o painel sem tocar no banco real

```bash
npm run banco:simulado         # terminal 1: banco fictício em memória, porta 54321
```

Em outro terminal, com estas variáveis (valores de **teste**, não segredos):

```
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_SERVICE_ROLE_KEY=sb_secret_chave-so-de-teste-0123456789
ADMIN_PASSWORD=senha-de-teste-bem-longa
AUTH_SECRET=abcdefghijklmnopqrstuvwxyz0123456789ABCD
```

Vêm 28 leads fictícios, com casos de borda (nome enorme, telefone inválido,
status desconhecido, "não contatar", retorno atrasado, faixa antiga 16–18).

### Verificações

```bash
npm run lint
npm run typecheck
npm test                       # 291 testes; a parte de banco roda Postgres de verdade (pglite)
npm run build
npm run verificar:bundle       # nenhum segredo nos arquivos que o navegador baixa
```

## Rotas

| Rota | O que faz |
| --- | --- |
| `/login` | Senha única. Única rota pública |
| `/` | Lista paginada, mais recentes primeiro. Busca, filtro por status e "Retornos" |
| `/leads/[id]` | Detalhe: dados, WhatsApp, status, retorno, anotações, histórico, origem |

## Estrutura

```
src/
├── proxy.ts                Triagem otimista + noindex + CSP com nonce (era "middleware")
├── config/marca.ts         Nome do painel e da oferta — fonte única
├── lib/
│   ├── lead.ts             Tipos, rótulos, leitura defensiva — SEM server-only (o cliente importa)
│   ├── validacao.ts        Limites e saneamento de entrada — SEM server-only
│   ├── telefone.ts         Normalização brasileira (+55, DDD 55, inválido → sem link)
│   ├── tempo.ts            Datas em America/Sao_Paulo, por dia de calendário
│   ├── navegacao.ts        URLs da lista e "voltar" sem open redirect
│   ├── resultados.ts       Resultado tipado das edições
│   ├── config.ts           Validação das variáveis de ambiente (falha fechada)
│   ├── erros.ts, log.ts    Erros tipados e log sanitizado
│   ├── banco.ts            Único ponto de saída ao Supabase: prazo, erros tipados, sem retry de escrita
│   ├── repositorio.ts      Consultas e escrita com versão — todas chamam exigirSessao()
│   ├── sessao.ts           Sessão opaca e revogável
│   ├── limite.ts           Freio de login persistente
│   ├── auth.ts             exigirSessao() — a DAL
│   ├── cursor.ts           Paginação por cursor (só servidor)
│   └── acoes.ts            Server Actions
├── components/
└── app/
supabase/
├── migrations/             crm_0001 — aditiva e idempotente
├── rollback/
└── verificacao/inspecao.sql  Prova RLS/grants no banco REAL (o README só afirma)
tests/                      db (Postgres real), integracao (banco simulado), unit, ui (jsdom)
scripts/                    banco-simulado, verificar-bundle, encerrar-sessoes
```

`lead.ts` e `repositorio.ts` são separados de propósito: componentes de cliente
precisam dos rótulos de status, e importar um módulo `server-only` no navegador
quebra o build.

## Convenções

- **Leia `AGENTS.md` antes de escrever código.** O Next 16 tem mudanças que
  quebram o que você "sabe": `cookies()`, `params` e `searchParams` são
  assíncronos; `middleware.ts` virou `proxy.ts`; `redirect()` lança um erro
  interno que um `catch` não pode engolir (use `unstable_rethrow`).
- **Tailwind v4**: não existe `tailwind.config.js`. Tokens em `@theme inline`,
  dentro de `src/app/globals.css`.
- **Cores**: Onyx `#10100E`, Dourado `#F4B942`, Marfim `#F6F3E8`. Nunca
  azul/navy — é da VAZXPRESS, outro braço da ZXP.
- **Texto**: use `text-texto`, `text-texto-2`, `text-texto-3` (contraste
  medido). **Nunca `text-marfim/NN`** — um teste varre o código atrás disso.
- **Mobile-first**: o uso real é no celular, entre uma conversa e outra. Alvos
  de toque ≥ 44px.
- Português do Brasil, tom direto. Nunca inventar números ou resultados.
