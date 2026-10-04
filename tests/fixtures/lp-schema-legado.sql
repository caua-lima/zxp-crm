-- Tabela da LP como era no começo (schema.sql da primeira versão), SEM as
-- colunas de confirmação de responsável, idempotência, utm e notificação.
create table public.leads (
  id uuid primary key default gen_random_uuid(),
  criado_em timestamptz not null default now(),
  nome text not null,
  whatsapp text not null,
  email text not null,
  idade text not null,
  peso text not null,
  contexto text,
  consentimento_em timestamptz not null,
  status text not null default 'novo'
    check (status in ('novo','contatado','call_marcada','call_feita','fechado','perdido')),
  observacoes text
);
