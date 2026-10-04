-- Tabela de leads da ZXP Direciona.
--
-- Instalação NOVA (tabela ainda não existe): rode este arquivo inteiro no SQL
-- Editor do Supabase, uma vez.
--
-- Tabela JÁ EXISTE (você já tem leads gravados): NÃO rode este arquivo de
-- novo — `create table if not exists` não adiciona colunas numa tabela que já
-- existe. Rode as migrações em `supabase/migrations/`, em ordem, uma vez cada.

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  criado_em timestamptz not null default now(),

  nome text not null,
  whatsapp text not null,
  email text not null,
  idade text not null,
  peso text not null,
  contexto text,

  -- Prova de consentimento (LGPD). O público inclui menor de idade, então
  -- guardar QUANDO a pessoa autorizou o contato não é burocracia: é o que
  -- sustenta o tratamento do dado caso alguém questione.
  consentimento_em timestamptz not null,

  -- Só é true quando faz sentido (idade = "16 a 17"); pra 18+ fica sempre
  -- false e não significa nada — não é assinatura de responsável, é a
  -- confirmação que a PESSOA que preencheu marcou no formulário.
  confirmacao_responsavel boolean not null default false,

  -- Campos do micro-CRM (fase 2). Já existem pra não precisar de migração.
  status text not null default 'novo'
    check (status in ('novo','contatado','call_marcada','call_feita','fechado','perdido')),
  observacoes text,

  -- Chave gerada pelo cliente por tentativa de submissão — permite reenviar
  -- com segurança depois de uma falha, sem duplicar o lead. NULL é normal
  -- (cliente sem a chave, ou lead antigo); Postgres não considera NULL
  -- igual a NULL, então isso nunca cria falso conflito entre leads sem chave.
  idempotency_key text,

  -- Origem da campanha (ver src/lib/atribuicao.ts). NULL = veio direto ou é
  -- lead antigo. Só o host do referrer, nunca a URL; só utm_*, nunca a query
  -- inteira.
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  referrer_host text,

  -- Controle do aviso por e-mail (ver src/lib/notificacao.ts). notificado_em
  -- NULL = ainda não avisamos; a segunda coluna é uma lease de 5 min que
  -- impede dois envios simultâneos do mesmo lead.
  notificado_em timestamptz,
  notificacao_reivindicada_em timestamptz
);

create index if not exists leads_criado_em_idx on public.leads (criado_em desc);
create index if not exists leads_status_idx on public.leads (status);
create unique index if not exists leads_idempotency_key_idx on public.leads (idempotency_key);

-- Rate limit por IP pseudonimizado (hash, nunca texto puro) — ver
-- src/lib/rateLimit.ts.
create table if not exists public.rate_limit_hits (
  bucket text not null,
  ocorrido_em timestamptz not null default now()
);

create index if not exists rate_limit_hits_bucket_idx on public.rate_limit_hits (bucket, ocorrido_em);
alter table public.rate_limit_hits enable row level security;

-- ─────────────────────────────────────────────────────────────────────────
-- Segurança: RLS ligado e NENHUMA policy criada.
--
-- Sem policy, as chaves públicas (anon / authenticated) não leem nem escrevem
-- nada — mesmo que a anon key vaze no navegador, a tabela fica inacessível.
-- A service_role key, usada só no servidor (rota /api/leads), ignora RLS por
-- design e continua funcionando.
--
-- Isso importa aqui: a tabela guarda nome, telefone e um texto pessoal de
-- adolescentes. O padrão seguro é ninguém ver, e abrir exceção só quando
-- houver motivo.
-- ─────────────────────────────────────────────────────────────────────────
alter table public.leads enable row level security;
