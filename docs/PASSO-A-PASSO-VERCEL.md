# Colocar o painel para funcionar na Vercel — passo a passo

Para fazer com calma, **na ordem**. Cada passo diz como saber se deu certo.

**Sintoma de partida:** a tela de login mostra *"O painel não está configurado.
Avise quem administra."* — isso quer dizer que **alguma variável da Vercel está
ausente ou fraca** (o código novo é mais rigoroso que o antigo, de propósito).

Endereço do painel: `https://zxp-crm-ru6a.vercel.app/login`

> **Nunca cole chave, senha ou segredo no chat.** Cole direto nos campos da
> Vercel e do Supabase. Se algum já passou por lá, trate como comprometido e
> troque.

---

## Antes de começar

Tenha à mão:

- [ ] Acesso à **Vercel** (projeto `zxp-crm`) e ao **Supabase** (projeto da LP).
- [ ] Um **gerenciador de senhas** aberto (a senha nova vai ser guardada nele).

---

## Passo 1 — Descobrir qual variável está errada (opcional, 1 min)

1. Vercel → projeto `zxp-crm` → aba **Logs**.
2. Procure por `login.configuracao_invalida`.
3. Abra a linha: o campo **`problemas`** lista os **nomes** das variáveis com
   defeito. Os valores nunca aparecem.

Exemplos do que pode aparecer:

| Texto no `problemas` | O que fazer |
| --- | --- |
| `ADMIN_PASSWORD ausente` / `curta demais` / `ainda é o valor de exemplo` | Passo 2 |
| `AUTH_SECRET ausente` / `curto demais` / `pouca variação` | Passo 3 |
| `SUPABASE_URL …` | Passo 3 |
| `SUPABASE_SERVICE_ROLE_KEY ausente` / `é uma chave PÚBLICA` | Passo 3 |

✅ **Deu certo quando:** você sabe quais nomes estão errados. (Se não achar o
log, pule — o passo 2 e o 3 resolvem de qualquer jeito.)

---

## Passo 2 — Definir a senha do painel

A senha em produção precisa ter **12 ou mais caracteres** e **não pode** ser o
texto de exemplo (`trocar-esta-senha-no-deploy`).

1. Crie uma senha **longa e única** (o gerenciador de senhas gera). Guarde lá.
   *(Precisa de uma gerada para você? Peça: "gera uma senha para a Vercel".)*
2. Vercel → projeto `zxp-crm` → **Settings → Environment Variables**.
3. Ache **`ADMIN_PASSWORD`** → **Edit** (ou **Add New**, se não existir).
4. Cole a senha no campo **Value**.
5. Em *Environments*, marque **só Production**. Desmarque Preview e Development.
6. **Save**.

✅ **Deu certo quando:** `ADMIN_PASSWORD` aparece na lista, só em Production.

---

## Passo 3 — Conferir as outras três variáveis

Todas só em **Production**.

| Variável | Tem que ser | Erros comuns |
| --- | --- | --- |
| `SUPABASE_URL` | `https://xxxx.supabase.co` — **só a raiz** | Colar com `/rest/v1/` no fim; usar `http://` |
| `SUPABASE_SERVICE_ROLE_KEY` | Chave **secreta** (`sb_secret_…`) | Usar a `publishable`/`anon` (o painel **recusa**) |
| `AUTH_SECRET` | 32+ caracteres, com variação | Curto demais; repetitivo (`aaaa…`) |

Onde achar a chave secreta: Supabase → **Project Settings → API Keys → Secret
keys**. Se não existir nenhuma, **Create new secret key**.

Para gerar um `AUTH_SECRET` novo (no terminal, na pasta do projeto):

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

✅ **Deu certo quando:** as 4 variáveis (`SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_PASSWORD`, `AUTH_SECRET`) estão na lista,
todas em Production.

---

## Passo 4 — Aplicar a migration no Supabase

**Sem isto o login não funciona**, mesmo com tudo certo na Vercel: a tela passa
a dizer *"Não consegui verificar o acesso agora"*. Se você já aplicou, pule.

1. Supabase → abra o projeto. Se aparecer **projeto pausado**, clique em
   **Restore** e espere 1 a 3 minutos.
2. **SQL Editor → New query**.
3. Abra o arquivo `supabase/migrations/crm_0001_seguranca_e_integridade.sql`
   (neste projeto), copie **tudo** e cole.
4. **Run**.

✅ **Deu certo quando:** aparece `Success. No rows returned`.

Se a execução **parar com uma mensagem** dizendo *"Falta a migration … da LP"*:
é normal e **não alterou nada**. Rode primeiro as migrations da LP (projeto
`zxp-direciona`, pasta `supabase/migrations/`), **na ordem**, uma de cada vez, e
depois rode esta de novo.

---

## Passo 5 — Redeploy

Variável editada **só vale depois de um novo deploy**.

1. Vercel → **Deployments**.
2. No deploy mais recente: **⋯ (três pontos) → Redeploy**.
3. Espere ficar **Ready**.

✅ **Deu certo quando:** o deploy está **Ready** e é novo (horário de agora).

---

## Passo 6 — Entrar

1. Abra `https://zxp-crm-ru6a.vercel.app/login`.
2. Digite a senha do **passo 2**.

| O que aparece | Significa | O que fazer |
| --- | --- | --- |
| **A lista de leads** | ✅ Funcionou | Passo 7 |
| "O painel não está configurado" | Ainda há variável errada | Volte ao Passo 1 e leia o `problemas` |
| "Não consegui verificar o acesso agora" | Migration não aplicada, ou banco pausado | Passo 4 |
| "Senha incorreta." | Senha diferente da que está na Vercel, ou deploy antigo | Confira o Passo 2 e o Passo 5 |
| "Muitas tentativas. Tente de novo em…" | Freio de segurança (3 erros livres) | Espere o tempo que a tela diz |

---

## Passo 7 — Conferir que está tudo certo

- [ ] A lista mostra os leads reais e o total bate com a tabela do Supabase.
- [ ] Abra um lead → **Chamar no WhatsApp** abre a conversa com a mensagem pronta
      (e o status **não** muda sozinho).
- [ ] Escreva uma anotação → **Salvar anotações** → aparece *"Salvo às HH:MM"*.
- [ ] Menu **Conta → Sair deste aparelho** → volta ao login.
- [ ] No Supabase, rode `supabase/verificacao/inspecao.sql` e compare com o
      esperado (está comentado em cada bloco). É o que **comprova** a segurança
      do banco.

O checklist completo está em [CONFIGURACAO.md](CONFIGURACAO.md#6-teste-de-fumaça-depois-de-cada-deploy).

---

## Se continuar sem funcionar

Me mande **só estas duas informações** (nada secreto):

1. O **texto exato** que aparece na tela de login.
2. O campo **`problemas`** da linha `login.configuracao_invalida` do log da
   Vercel (Passo 1) — ou, se for outro erro, a linha de log com `evento`,
   `categoria` e `status`.

Com isso dá para apontar a variável ou o passo exato. **Não envie** senha, chave
nem o conteúdo do `.env.local`.
