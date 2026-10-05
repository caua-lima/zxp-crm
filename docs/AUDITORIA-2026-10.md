# Auditoria de outubro de 2026 — o que foi feito, item a item

Referência: auditoria do commit `344ab63` (4/10/2026). Este arquivo diz, para cada
achado, **o que foi feito, onde, e com que evidência** — e separa o que está
**implementado e testado localmente** do que **só você consegue validar**.

Legenda: ✅ feito e testado localmente · 🟡 feito, mas depende de uma ação ou
validação sua · ⚪ não feito (com o motivo).

> **Parecer honesto:** o código está **pronto para configurar e publicar**. Ele
> **não** foi validado contra o Supabase real nem contra a Vercel — nada
> automatizado tocou em produção. O teste de fumaça em
> [CONFIGURACAO.md](CONFIGURACAO.md) é o que fecha isso. Os bloqueios que
> restam são **seus**, listados no fim.

## Segurança

| ID | Achado | Estado | O que foi feito |
| --- | --- | --- | --- |
| S01 | Next.js 16.3.0 com 3 avisos | ✅ | Next e `eslint-config-next` em **16.3.8** (pin exato). `npm audit --omit=dev`: **0**. Os 6 avisos restantes são só da cadeia do ESLint (lint/CI); a "correção" do npm é downgrade e **não foi aplicada** — ver [OPERACAO.md](OPERACAO.md#dependências) |
| S02 | Rate limit em memória | ✅ | Contador **no banco**, atômico (upsert trava a linha), com expiração e limpeza; chave = HMAC do IP. Teste: o bloqueio **sobrevive** a `vi.resetModules()` (outra instância). Falha **fechada** se o banco cai |
| S03 | Logout/troca de senha não revogam | ✅ | Sessão **opaca** (32 bytes), hash no banco, consulta a cada requisição. Teste: uma **cópia** do cookie para de valer após logout, após "sair de todos" e após trocar a senha. Comentário "não há o que roubar" corrigido: o cookie **é** credencial |
| S04 | Parser permissivo / config pouco validada | ✅ | O formato HMAC antigo **foi removido** (cookie fora do formato nem chega ao banco). `src/lib/config.ts` valida URL https, chave secreta (recusa publishable/anon), senha ≥ 12 e fora do exemplo, `AUTH_SECRET` com tamanho **e** variação. Falha fechada, mensagem só com **nomes** |
| S05 | RLS afirmada, não demonstrada | 🟡 | `supabase/verificacao/inspecao.sql` comprova RLS/policies/grants/EXECUTE. **Eu não tive acesso ao banco real: você precisa rodá-lo.** Tabelas novas nascem com RLS, sem policy, sem privilégio para anon/authenticated (testado no Postgres embutido) |
| S06 | Alcance da credencial administrativa | ⚪ | Continua `service_role`. Reduzir (papel restrito/RPCs) é possível, mas troca a arquitetura de acesso e não dá para validar sem o banco real. A defesa hoje é a DAL em **toda** operação + validação de toda entrada. Registrado em [OPERACAO.md](OPERACAO.md#limites-conhecidos) |
| S07 | Cabeçalhos de defesa | ✅🟡 | `X-Frame-Options`, `nosniff`, `Referrer-Policy: same-origin`, `Permissions-Policy`, COOP e **CSP com nonce** (proxy). Verificado num **build de produção** local: hidrata, 13 scripts com nonce, console limpo. 🟡 Falta conferir na Vercel real (passo do teste de fumaça). Saída de emergência: `CSP_REPORT_ONLY=1` |
| S08 | Logs com corpo bruto do provedor | ✅ | Erros tipados; log estruturado que descarta campos de nome sensível. Teste com marcadores de dado pessoal na resposta do banco: **não aparecem** no log nem na mensagem |

> **Defeito que achei e corrigi no caminho (S07):** `Referrer-Policy: no-referrer`
> fazia o navegador mandar `Origin: null` até em formulário para o próprio site, e
> o Next recusava a Server Action ("Invalid Server Actions request", HTTP 500) no
> POST nativo. Trocado por `same-origin`, com teste de regressão.

## Integridade

| ID | Achado | Estado | O que foi feito |
| --- | --- | --- | --- |
| D01 | Corte silencioso em 500 | ✅ | Paginação por **cursor** `(criado_em, id)`, contadores via `crm_contagens()` sobre a tabela inteira. Testes: 0, 1, 25, **501**, timestamps iguais, lead chegando no meio da navegação, e o caso exato da auditoria (lead antigo `novo` além do 500º aparece e o contador mostra 1) |
| D02 | "Salvo" sem confirmar a linha | ✅ | `PATCH … Prefer: return=representation`; **o corpo é a prova**. Zero linhas → `conflito` ou `nao_encontrado`. Teste: **204 sem corpo não vira "salvo"** |
| D03 | Anotações sem estado de edição | ✅ | `rascunho` / `enviado` / `confirmado` separados. Testes (jsdom): salvar A, digitar B no meio → B preservado e "não salvo"; erro e conflito preservam o texto; só espaços não conta como alteração; nada em localStorage |
| D04 | Duas abas sobrescrevem | ✅ | Coluna `versao` (gatilho no banco), `WHERE id AND versao`. Verificado **ao vivo** no navegador: a segunda aba recebe o conflito, vê a versão do servidor e escolhe. A versão é **compartilhada** entre status/retorno/anotações (cada seção com a sua daria conflito contra você mesmo — há teste) |
| D05 | `+55` duplicado | ✅ | `src/lib/telefone.ts`: DDI cortado só com 12–13 dígitos (DDD 55 preservado); inválido **não gera link**. 28 testes (nacional, +55, DDD 55, zeros, inválidos) |
| D06 | Validação parcial | ✅ | UUID, versão, status em allowlist, observações ≤ 5.000 (cliente, servidor e constraint do banco), retorno ≤ 120, datas ISO, cursor adulterado → recomeça. Respostas do banco lidas defensivamente (status desconhecido → "Desconhecido"; linha sem id → ignorada e **contada** num aviso) |
| D07 | Datas | ✅ | Dia de **calendário** em `America/Sao_Paulo`. Teste do caso da auditoria (00:30 → "há 2 dias", não "ontem"), virada de mês/ano, data inválida/nula/futura sem lançar |
| D08 | Erro de status sem recuperação local | ✅ | Resultado tipado; o select é controlado pelo status **confirmado** (falha não o muda); `redirect` nunca é engolido (`unstable_rethrow`) |
| D09 | Sem prazo | ✅ | `AbortSignal.timeout` (8 s). Leitura repete **uma** vez; **escrita nunca** — timeout vira "resultado incerto" e salvar de novo é seguro (a versão reconhece o que já foi gravado). Testado |

## Usabilidade

| ID | Achado | Estado | O que foi feito |
| --- | --- | --- | --- |
| U01 | Busca e fila | ✅ | Nome, e-mail e telefone (via `whatsapp_digitos`); termo **saneado** contra injeção de filtro PostgREST (teste de ataque); termo em **cookie**, fora da URL. Filtros "Novo" e "Retornos". Verificado ao vivo, inclusive por POST nativo |
| U02 | Novos leads não aparecem | ✅ | "Atualizado às HH:MM" + Atualizar; consulta a cada 60 s **só com a aba visível**; aviso "Há N leads novos" **sem reordenar** a lista |
| U03 | Sem próxima ação | ✅ | `proxima_acao_em`/`proxima_acao` + histórico `lead_eventos` (de → para; **sem** copiar anotação). Atraso mostrado em **texto** |
| U04 | WhatsApp não prova contato | ✅ | Abrir o link **não muda o status**. "Marcar como contatado" é manual. Copiar telefone/e-mail com aviso acessível. Número inválido: sem botão. "Não contatar" bloqueia o botão |
| U05 | Volta perde contexto | ✅ | `?de=` carrega só parâmetros **conhecidos e validados**; teste com 9 destinos maliciosos: nenhum vira endereço externo |
| U06 | Contraste | ✅ | Tokens `texto`/`texto-2`/`texto-3` **medidos** em 6 fundos (≥ 4,5:1) e borda de controles ≥ 3:1. Teste lê o CSS real e **varre o código** atrás de `text-marfim/NN` |
| U07 | Estados e acessibilidade | ✅🟡 | `loading.tsx`, vazio, sem resultado, erro, não encontrado, sessão expirada; h1 no login, link "pular", mostrar senha, Caps Lock, regiões `aria-live`. 🟡 **Teclado, leitor de tela e zoom 200 % não foram verificados** |
| U08 | Layout | 🟡 | Lista em 2 colunas no desktop; detalhe com coluna lateral; contato antes da edição no celular. Verificado no celular (375 px) no Chromium. 🟡 **Desktop e 320 px não foram vistos** (painel do navegador oculto). Botão fixo no detalhe: **não feito** de propósito (exige teste com teclado virtual) |
| U09 | Marca | ✅ | `src/config/marca.ts` (ZXP CRM atendendo a **ZXP Direciona**, o nome atual da LP). "Nas palavras dela" → "Contexto informado". `peso` rotulado "O que mais pesa" |

## Privacidade, operação e manutenção

| ID | Achado | Estado | O que foi feito |
| --- | --- | --- | --- |
| O01 | Consentimento, não contatar, retenção | 🟡 | ✅ **Não contatar** modelado à parte do status, respeitado na tela, com histórico. ✅ Consentimento e confirmação de responsável exibidos **como declaração**, não verificação. ⚪ Versão/origem do aviso: **depende da LP** gravar. ⚪ Retenção, procedimento de direitos e base legal: **decisões suas** — nada foi inventado. Ver [CONTRATO-LP-CRM.md](CONTRATO-LP-CRM.md#pendências-de-coordenação-precisam-de-decisão-sua) |
| O02 | Lista traz campos demais | ✅ | Lista seleciona 9 colunas; só o detalhe traz telefone, e-mail, contexto e anotações |
| O03 | Contrato e migrations | ✅ | [CONTRATO-LP-CRM.md](CONTRATO-LP-CRM.md), migration `crm_0001` + rollback + fixtures (`tests/fixtures/lp-schema.sql`). Telefone **não** foi tornado único |
| O04 | Sem testes nem CI | ✅ | 291 testes em 14 arquivos (banco real embutido, integração, jsdom, unitários) + `.github/workflows/ci.yml` + Dependabot. Verificador de segredos no bundle com **controle negativo** (acusa um vazamento injetado) |
| O05 | Operação não documentada | 🟡 | [OPERACAO.md](OPERACAO.md): ambientes, rotação, revogação, rollback, smoke test, limites. 🟡 **Backup/restauração e alertas não foram verificados nem configurados** — dependem do seu plano Supabase |
| O06 | Recursos a adiar | ⚪ | Respeitado: nada de kanban, automação, dashboard, multiusuário, exportação, PWA/offline |

## O que ficou pendente e é seu

Em ordem de importância (a lista completa de passos está na resposta final).

1. **Aplicar `crm_0001`** no Supabase e rodar `inspecao.sql` — **antes** de publicar.
2. **Variáveis na Vercel**, só em Production; `ADMIN_PASSWORD` ≥ 12 caracteres.
3. **Teste de fumaça** na publicação real.
4. **Revogar a chave secreta antiga do Supabase** que passou pelo chat na primeira sessão (e confirmar que ela não funciona mais).
5. **Decidir** plano pago do Supabase ou rotina semanal (pausa derruba a captação).
6. **Decisões de privacidade** (retenção, direitos, tratamento de menores, versão do aviso).
7. Verificar **teclado, leitor de tela, desktop e 320 px**.
