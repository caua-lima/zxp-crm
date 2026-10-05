# Contrato entre a LP e o CRM

A landing page (`zxp-direciona`) e o painel (`zxp-crm`) usam **a mesma tabela
`leads`, no mesmo projeto Supabase**. Não há API entre os dois, nem banco
espelho. Um mudar a tabela sem avisar o outro quebra o outro.

Este documento é o acordo. **Se você mudar a tabela, atualize aqui.**

## Quem é dono do quê

| Quem | Dono de |
| --- | --- |
| **LP** | O cadastro: `nome`, `whatsapp`, `email`, `idade`, `peso`, `contexto`, `consentimento_em`, `confirmacao_responsavel`, `idempotency_key`, `utm_*`, `referrer_host`, `notificado_em`, `notificacao_reivindicada_em`, `criado_em`, `id`. E as tabelas `rate_limit_hits`. |
| **CRM** | O atendimento: `status`, `observacoes`, `versao`, `atualizado_em`, `proxima_acao_em`, `proxima_acao`, `nao_contatar_em`, `whatsapp_digitos` (gerada). E as tabelas `lead_eventos`, `crm_sessoes`, `crm_login_tentativas`. |

Regra: **a LP só faz `INSERT` em `leads`** (e atualiza `notificado_em` /
`notificacao_reivindicada_em` do aviso por e-mail). **O CRM só lê e atualiza as
colunas dele.** Nenhum dos dois apaga lead.

## A tabela `leads`

| Coluna | Tipo | Nulo? | Padrão | Dono | Observação |
| --- | --- | --- | --- | --- | --- |
| `id` | uuid | não | `gen_random_uuid()` | LP | Chave primária |
| `criado_em` | timestamptz | não | `now()` | LP | Base da ordem da lista |
| `nome` | text | não | — | LP | |
| `whatsapp` | text | não | — | LP | **Formatado**, ex.: `(11) 91234-5678`. O CRM normaliza para o link; ver abaixo |
| `email` | text | não | — | LP | A LP pode tornar opcional no futuro: o CRM já tolera vazio |
| `idade` | text | não | — | LP | Ver "Faixas de idade" |
| `peso` | text | não | — | LP | A opção "o que mais pesa". **Não é peso corporal** |
| `contexto` | text | sim | — | LP | Texto livre, até 400 caracteres. Pode ter dado íntimo |
| `consentimento_em` | timestamptz | não | — | LP | Quando a pessoa marcou a autorização de contato |
| `confirmacao_responsavel` | boolean | não | `false` | LP | Só tem sentido para `16 a 17` |
| `idempotency_key` | text | sim | — | LP | Índice único; `NULL` é normal |
| `utm_source` … `utm_term`, `referrer_host` | text | sim | — | LP | `NULL` = acesso direto ou lead antigo |
| `notificado_em`, `notificacao_reivindicada_em` | timestamptz | sim | — | LP | Controle do aviso por e-mail |
| `status` | text | não | `'novo'` | CRM | `novo`, `contatado`, `call_marcada`, `call_feita`, `fechado`, `perdido` (constraint) |
| `observacoes` | text | sim | — | CRM | Até 5.000 caracteres (constraint `NOT VALID`: vale para escrita nova) |
| `versao` | integer | não | `1` | CRM | Sobe **só** quando muda algo que o CRM edita |
| `atualizado_em` | timestamptz | sim | — | CRM | Idem |
| `proxima_acao_em` | timestamptz | sim | — | CRM | Retorno combinado |
| `proxima_acao` | text | sim | — | CRM | Até 120 caracteres |
| `nao_contatar_em` | timestamptz | sim | — | CRM | Não nulo = a pessoa pediu para não ser contatada |
| `whatsapp_digitos` | text | — | gerada | CRM | `regexp_replace(whatsapp, '\D', '', 'g')`; só para busca |

### Por que `versao` não sobe quando a LP mexe

O aviso por e-mail da LP atualiza `notificado_em`. Se isso subisse a versão, quem
estivesse editando o mesmo lead tomaria um "conflito" falso. O gatilho
`crm_leads_antes_update` só incrementa quando **status, anotações, retorno,
descrição do retorno ou "não contatar"** mudam. Há teste para isso
(`tests/db/migracao.test.ts`).

## Formatos que o CRM assume

### Telefone (`whatsapp`)

O CRM lê o que a LP gravou e **normaliza só para montar o link** do WhatsApp
(`src/lib/telefone.ts`). Regras:

- aceita máscara, espaços, `+55`, `0055`, `0` + DDD;
- **DDI só é cortado se sobrarem 12 ou 13 dígitos** — o DDD 55 existe (Santa
  Maria/RS) e um número nacional com DDD 55 tem 11 dígitos;
- exige DDD real, celular com 11 dígitos começando em 9, e rejeita dígitos
  repetidos;
- **número inválido nunca gera link** (a versão antiga gerava `wa.me/55`, que
  abre um chat para lugar nenhum).

Isto valida o **formato**. Não prova que existe conta de WhatsApp nem que o
número está ativo.

### Faixas de idade (`idade`)

| Valor | Significado | Como o CRM trata |
| --- | --- | --- |
| `16 a 17` | Menor de idade | Selo "Menor de idade"; mostra a confirmação de responsável |
| `18 a 21`, `22 a 25`, `26 ou mais` | Adulto | Sem selo |
| `16 a 18` | **Valor antigo e ambíguo** (mistura menor e maior) | Selo "Faixa antiga 16–18". **Nunca** é reclassificado: o texto salvo não permite saber se a pessoa tinha 16, 17 ou 18 |
| `19 a 21` | Valor antigo | Exibido como está |
| qualquer outro / vazio | — | Exibido como está; não derruba nada |

> **A LP não deve ter uma migration que reescreva `16 a 18`.** Está dito também
> no cabeçalho da migration `0001` da LP.

`confirmacao_responsavel = true` significa que **a pessoa marcou no formulário**
que um responsável está ciente e de acordo com o contato. O CRM exibe isso como
**declaração** — não como verificação.

### Datas

Todas `timestamptz`, em UTC no banco. O CRM exibe e interpreta **sempre em
`America/Sao_Paulo`** (a Vercel roda em UTC; sem isso, um lead das 21h apareceria
como 00h do dia seguinte). "Ontem", "hoje" e "retornos de hoje" são por **dia de
calendário** de São Paulo, não por blocos de 24 horas.

### Status

O banco aceita só os seis valores (constraint). Se algum dia aparecer outro (criado
fora do painel), o CRM mostra "Desconhecido" em vez de quebrar a lista, e o
contador separa em "outros".

## Garantias do CRM sobre dados legados

- Linha sem `id` válido é **ignorada** (e contada num aviso na lista); nunca
  derruba a página inteira.
- Campo ausente, `NULL` ou de tipo inesperado vira valor neutro (`(sem nome)`,
  vazio, `false`).
- **Nada é apagado nem reescrito** para "arrumar" dado antigo.

## Como mudar a tabela sem quebrar o outro lado

1. Mudança **aditiva** (coluna nova, nulável ou com padrão). Nunca renomear nem
   remover coluna que o outro lado usa.
2. Migration **idempotente** (`if not exists`), numerada na pasta do repositório
   dono: LP → `0005_…`; CRM → `crm_0002_…`.
3. **Ordem de publicação**: migration primeiro, código depois.
4. Atualize este documento e os fixtures dos testes
   (`tests/fixtures/lp-schema.sql` é uma cópia do `schema.sql` da LP).
5. Rode `npm test`: os testes de migração rodam o SQL num Postgres de verdade.

## Pendências de coordenação (precisam de decisão sua)

| Item | O que falta | Quem decide |
| --- | --- | --- |
| **Versão do aviso de privacidade** e **origem do formulário** gravados junto ao lead | A LP precisaria gravar (ex.: `aviso_versao`) e o CRM exibir. **Não implementado:** inventar um campo que a LP não grava seria fingir um dado. | Você, junto com a LP |
| **Prazo de retenção** dos dados | Define quando e como apagar. O CRM **não apaga nada sozinho**. | Você (responsável pelo tratamento) |
| **Procedimento de acesso/correção/eliminação** a pedido da pessoa | Hoje é manual, no Supabase. Precisa de rotina e de responsável. | Você |
| **Base legal e tratamento de menores** | Decisão jurídica/operacional. O painel mostra o que a pessoa declarou, e não verifica. | Você, com apoio jurídico |

Nada disso foi decidido ou inventado pelo código.
