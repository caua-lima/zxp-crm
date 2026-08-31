# ZXP CRM — painel de leads da RUMO

Painel interno para atender quem se cadastra na landing page da
[RUMO](https://rumo-lp.vercel.app), a mentoria de direção profissional da ZXP
Solutions.

Não é um CRM completo, e isso é uma decisão, não uma pendência: é uma lista de
leads, um detalhe por lead e um botão que abre o WhatsApp. Kanban arrastável,
automação de e-mail, dashboard de métricas e multiusuário estão **fora de
escopo** — é onde projeto assim morre antes de ser usado.

**Stack:** Next.js 16 (App Router) · TypeScript · Tailwind v4 · Supabase.

---

## Como funciona

A landing page (repositório `rumo-lp`) grava os cadastros na tabela `leads` do
Supabase. Este painel lê **a mesma tabela, no mesmo projeto Supabase** — não há
sincronização, banco espelho nem API entre os dois. Um escreve, o outro lê.

```
rumo-lp  ──POST /api/leads──►  Supabase (tabela leads)  ◄──leitura/escrita──  zxp-crm
```

## Segurança

O painel lista **nome, telefone e um relato pessoal de adolescentes de 16 a 17
anos**. Isso define o nível de cuidado do projeto inteiro:

- **Sessão de usuário único**, cookie assinado com HMAC-SHA256 (`httpOnly`,
  `secure` em produção, `sameSite=lax`). Sem biblioteca de auth: é um usuário
  só, e 40 linhas auditáveis valem mais que uma dependência.
- **Senha comparada em tempo constante** (`src/lib/sessao.ts`). Nunca no
  código, nunca com prefixo `NEXT_PUBLIC_`.
- **Freio de força bruta** no login: 3 erros livres, depois bloqueio que dobra
  a cada tentativa até 15 minutos (`src/lib/limite.ts`).
- **Toda leitura e toda escrita passa por `exigirSessao()`** (`src/lib/auth.ts`).
  Isso não é redundância: Server Actions são endpoints POST alcançáveis por
  fora da interface — proteger só a tela deixaria as ações abertas.
- **`noindex`** por metadata e por cabeçalho `X-Robots-Tag` (`src/proxy.ts`).
- A `service_role` do Supabase **nunca chega ao navegador**. A tabela tem RLS
  ligado e nenhuma policy, então nenhuma chave pública lê nada — nem se vazar.

> O `src/proxy.ts` (no Next 16 é o que antes se chamava middleware) só faz uma
> checagem **otimista**: olha se o cookie existe, não se ele é válido. Quem
> autoriza de verdade é a DAL.

## Variáveis de ambiente

Copie `.env.example` para `.env.local` e preencha. As mesmas vão em
**Vercel → Settings → Environment Variables**.

| Variável | O que é |
| --- | --- |
| `SUPABASE_URL` | URL do projeto Supabase (a mesma da `rumo-lp`) |
| `SUPABASE_SERVICE_ROLE_KEY` | Chave secreta (`sb_secret_…` ou `service_role`). **Nunca a publishable.** |
| `ADMIN_PASSWORD` | Senha de entrada no painel |
| `AUTH_SECRET` | Segredo que assina o cookie. Mínimo 32 caracteres |

Gere o `AUTH_SECRET` com:

```bash
openssl rand -base64 32
```

Nenhuma delas pode ter prefixo `NEXT_PUBLIC_`: esse prefixo embute o valor no
JavaScript que o navegador baixa.

## Rodando

```bash
npm install
npm run dev
```

A landing page usa a porta 3000. Para rodar os dois ao mesmo tempo:

```bash
npm run dev -- --port 3001
```

## Rotas

| Rota | O que faz |
| --- | --- |
| `/login` | Senha única. Única rota pública. |
| `/` | Lista de leads, mais recentes primeiro, com filtro por status |
| `/leads/[id]` | Detalhe: dados, contexto, WhatsApp, status e anotações |

## Estrutura

```
src/
├── proxy.ts              Checagem otimista + noindex (era "middleware")
├── lib/
│   ├── constantes.ts     Nome do cookie e duração (sem server-only, o proxy usa)
│   ├── lead.ts           Tipos e rótulos — SEM server-only, o cliente importa
│   ├── repositorio.ts    Acesso ao Supabase — server-only
│   ├── sessao.ts         Assinatura, verificação e cookie
│   ├── auth.ts           exigirSessao() — a DAL
│   ├── limite.ts         Freio de força bruta
│   ├── acoes.ts          Server Actions
│   └── tempo.ts          Datas no fuso de São Paulo, não no do servidor
├── components/
└── app/
```

A separação entre `lead.ts` e `repositorio.ts` é deliberada: componentes de
cliente precisam dos rótulos de status, e importar um módulo `server-only` no
navegador quebra o build.

## Convenções

- **Leia `AGENTS.md` antes de escrever código.** O Next 16 tem mudanças que
  quebram o que você "sabe": `cookies()` e `params` são assíncronos,
  `middleware.ts` virou `proxy.ts`.
- **Tailwind v4**: não existe `tailwind.config.js`. Os tokens ficam em
  `@theme inline`, dentro de `src/app/globals.css`.
- **Cores**: Onyx `#10100E`, Dourado `#F4B942`, Marfim `#F6F3E8`. Nunca
  azul/navy — é da VAZXPRESS, outro braço da ZXP.
- **Mobile-first**: o uso real é no celular, entre uma call e outra. Alvos de
  toque ≥ 44px.
- Português do Brasil, tom direto. Nunca inventar números ou resultados.
