# Configuração e publicação

Este documento é o roteiro para colocar a versão revisada do painel no ar. **A
ordem importa** — o painel inteiro, inclusive o login, depende de uma migration
no banco.

> **Por que a ordem importa.** O código novo guarda sessões e conta tentativas de
> login no banco, e usa uma coluna de versão nos leads. Se você publicar o código
> **antes** de aplicar a migration, o painel sobe, mas ninguém consegue entrar:
> o login falha *fechado* ("Não consegui verificar o acesso agora"). Nada se
> perde nem vaza — só fica fechado até a migration ser aplicada.

## Resumo da ordem

1. Conferir que as migrations da LP já foram aplicadas.
2. Aplicar `crm_0001` no Supabase.
3. Conferir a segurança do banco com `inspecao.sql`.
4. Cadastrar as variáveis na Vercel (**só em Production**).
5. Publicar.
6. Fazer o teste de fumaça.

---

## 1. Pré-requisito: migrations da LP

A `crm_0001` precisa que a tabela `leads` tenha as colunas que a LP adicionou
(`confirmacao_responsavel`, `utm_*`, `referrer_host`). Se faltarem, **a migration
para no começo, sem alterar nada**, e diz qual migration da LP falta.

No SQL Editor, esta consulta mostra o que já existe:

```sql
select column_name
from information_schema.columns
where table_schema = 'public' and table_name = 'leads'
order by ordinal_position;
```

Devem aparecer, entre outras: `confirmacao_responsavel`, `idempotency_key`,
`utm_source` … `utm_term`, `referrer_host`. Se faltar alguma, rode as migrations
da LP (repositório `zxp-direciona`, pasta `supabase/migrations/`), **em ordem**,
uma vez cada.

## 2. Aplicar `crm_0001`

1. Supabase → **SQL Editor** → **New query**.
2. Cole o conteúdo **inteiro** de
   [`supabase/migrations/crm_0001_seguranca_e_integridade.sql`](../supabase/migrations/crm_0001_seguranca_e_integridade.sql).
3. **Run**. Esperado: `Success. No rows returned`.

Ela é **aditiva e idempotente**: pode ser rodada de novo sem erro, não apaga
nem reescreve nenhum lead, e a LP continua inserindo normalmente (todas as
colunas novas têm padrão ou aceitam vazio).

O que ela cria:

| Objeto | Para quê |
| --- | --- |
| `leads.versao`, `leads.atualizado_em` | Detectar duas abas editando o mesmo lead |
| `leads.proxima_acao_em`, `leads.proxima_acao` | Retorno combinado |
| `leads.nao_contatar_em` | Pedido da pessoa para não ser contatada |
| `leads.whatsapp_digitos` (gerada) | Busca por telefone (o campo guarda máscara) |
| `lead_eventos` | Histórico curto (de → para; **nunca** copia anotação nem relato) |
| `crm_sessoes` | Sessões revogáveis (só o hash) |
| `crm_login_tentativas` + funções `crm_login_*` | Freio de login persistente |
| `crm_contagens()` | Contadores verdadeiros da lista |

Para **desfazer**: [`supabase/rollback/crm_0001_rollback.sql`](../supabase/rollback/crm_0001_rollback.sql).
Ele é destrutivo para o que o CRM criou (histórico, sessões, retornos, "não
contatar"); leia o cabeçalho antes. Nunca toca nas colunas da LP nem apaga lead.

## 3. Conferir a segurança do banco

O README do projeto *afirma* que a tabela tem RLS ligado e nenhuma policy. Quem
**comprova** é o SQL de inspeção — rode-o no banco **real** e compare com o
esperado, que está comentado em cada bloco:

[`supabase/verificacao/inspecao.sql`](../supabase/verificacao/inspecao.sql)

O que precisa dar certo:

- RLS ligado nas 5 tabelas (`leads`, `lead_eventos`, `crm_sessoes`,
  `crm_login_tentativas`, `rate_limit_hits`);
- **zero** policies;
- as chaves públicas sem privilégio nas tabelas novas e sem `EXECUTE` nas funções
  `crm_*`.

> **Se algo vier diferente, não "corrija" apagando policy sem entender de onde
> ela veio.** Anote e investigue. Não crie `SELECT` público "para o painel
> funcionar": o painel acessa pelo servidor, com a chave secreta.

Teste final, de fora: a chave **pública** não deve ler nada.

```bash
curl -s "https://SEU-PROJETO.supabase.co/rest/v1/leads?select=id&limit=1" \
  -H "apikey: SUA_CHAVE_PUBLISHABLE" -H "Authorization: Bearer SUA_CHAVE_PUBLISHABLE"
```

Esperado: `[]`. (Uma lista com dados seria um problema grave.)

## 4. Variáveis na Vercel

Projeto `zxp-crm` → **Settings → Environment Variables**.

| Variável | Obrigatória | Onde obter | Exige novo deploy | Como validar |
| --- | --- | --- | --- | --- |
| `SUPABASE_URL` | Sim | Supabase → Project Settings → API (**só a raiz**, `https://xxxx.supabase.co`) | Sim | Login funciona |
| `SUPABASE_SERVICE_ROLE_KEY` | Sim | Supabase → API Keys → **Secret keys** (`sb_secret_…`) — **nunca** a publishable | Sim | Lista abre com os leads |
| `ADMIN_PASSWORD` | Sim | Você inventa. **≥ 12 caracteres**; gerenciador de senhas | Sim | Entra com ela |
| `AUTH_SECRET` | Sim | Gere (abaixo). **≥ 32 caracteres**, com variação | Sim | O painel sobe sem "não está configurado" |
| `CSP_REPORT_ONLY` | Não | `1` só em emergência (ver [OPERACAO.md](OPERACAO.md)) | Sim | — |
| `CRM_PRAZO_BANCO_MS` | Não | Prazo por chamada ao banco; padrão 8000 | Sim | — |

Gerar o `AUTH_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

### Marque **somente Production**

Na hora de adicionar cada variável, deixe marcado **só "Production"** — desmarque
Preview e Development.

- Um *preview deployment* é uma cópia publicada do código a cada branch. Com a
  chave do banco nele, qualquer preview acessível seria uma porta para dados de
  menores de idade. Sem as variáveis, o preview sobe e mostra "O painel não está
  configurado" — que é o comportamento certo.
- Em **Settings → Deployment Protection**, mantenha a proteção dos previews
  ligada (Vercel Authentication).
- Para testar de verdade num preview, use um projeto Supabase **separado**, com
  dados fictícios — nunca o de produção.

### Nenhuma variável pode ter `NEXT_PUBLIC_`

Esse prefixo embute o valor no JavaScript que o navegador baixa. O build confere:

```bash
npm run build && npm run verificar:bundle
```

O painel **recusa subir** com valor ausente ou fraco; a mensagem lista os
**nomes** das variáveis com problema, nunca os valores. Chave pública no lugar
da secreta também é recusada.

> Trocar `ADMIN_PASSWORD` ou `AUTH_SECRET` **derruba todas as sessões abertas**
> (cada sessão guarda uma impressão digital da senha). Trocar `AUTH_SECRET`
> também zera os bloqueios de login em andamento.

## 5. Publicar

```bash
git push origin main
```

A Vercel faz o deploy sozinha. Variável nova **não** entra em deploy já
existente: depois de cadastrar variáveis, faça **Deployments → ⋯ → Redeploy**.

Na primeira vez depois desta versão, **todo mundo precisa entrar de novo**: o
formato do cookie mudou, e o antigo é recusado de propósito.

## 6. Teste de fumaça (depois de cada deploy)

Leva ~3 minutos. Marque cada item.

- [ ] `https://SEU-PAINEL.vercel.app/` sem login → cai em `/login`.
- [ ] `curl -sI https://SEU-PAINEL.vercel.app/login` mostra `content-security-policy`,
      `x-frame-options: DENY`, `x-content-type-options: nosniff`,
      `referrer-policy: same-origin`, `x-robots-tag: noindex, nofollow, noarchive`.
- [ ] Senha errada → "Senha incorreta." (e nada além disso).
- [ ] Senha certa → abre a lista com os leads reais; o total bate com a tabela.
- [ ] Abrir um lead → o WhatsApp abre com a mensagem pronta; **o status não muda sozinho**.
- [ ] Escrever uma anotação → "Salvo às HH:MM"; recarregar → a anotação está lá.
- [ ] Em **duas abas**: salvar numa, depois na outra → a segunda mostra o conflito
      com a versão do servidor, sem sobrescrever.
- [ ] Menu **Conta → Sair deste aparelho** → volta ao login; o botão "voltar" do
      navegador não reabre a lista.
- [ ] A LP continua gravando: envie um cadastro de teste pelo formulário **real**
      e confira que ele aparece no painel, uma vez só.
- [ ] Abra o painel no celular. Console do navegador sem erros de CSP.

## Quando algo dá errado

| O que você vê | Causa provável | O que fazer |
| --- | --- | --- |
| "O painel não está configurado" | Variável ausente/fraca na Vercel | Vercel → Logs: o evento `login.configuracao_invalida` lista os **nomes** com problema |
| "Não consegui verificar o acesso agora" | Banco fora do ar (projeto Supabase **pausado**), ou migration `crm_0001` não aplicada | Abra o Supabase: se estiver pausado, restaure. Se não, aplique a migration (passo 2) |
| "Não foi possível carregar" | Idem, ou instabilidade passageira | Logs → `banco.erro` / `banco.falha`: veja `categoria` (`indisponivel`, `timeout`, `schema_desatualizado`, `configuracao`) |
| Logs com `categoria: schema_desatualizado` | Migration pendente | Aplique `crm_0001` |
| Logs com `categoria: configuracao` e `status: 401` | A chave do banco foi recusada (revogada, ou é a errada) | Gere outra no Supabase e atualize `SUPABASE_SERVICE_ROLE_KEY` |
| Painel abre vazio, sem erro | Chave **pública** no lugar da secreta (o painel recusa isso na subida; se acontecer, a validação foi contornada) | Troque pela secreta |
| "Muitas tentativas. Tente de novo em…" | Freio de login (3 erros livres) | Espere; não há como "destravar" por fora — é o ponto |

Logs ficam em **Vercel → projeto → Logs**. Cada linha é um JSON com `evento`,
`categoria`, `operacao`, `status`, `duracao_ms` e `correlacao` — e **nunca**
telefone, e-mail, anotação, senha ou cookie.
