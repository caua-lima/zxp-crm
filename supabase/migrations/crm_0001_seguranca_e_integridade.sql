-- crm_0001 — base de segurança e integridade do ZXP CRM.
--
-- O QUE FAZ (tudo aditivo e idempotente — pode rodar mais de uma vez):
--   1. Colunas novas em `leads`: versão (controle de conflito), atualizado_em,
--      próxima ação, "não contatar" e telefone só com dígitos (para busca).
--   2. Histórico curto de mudanças (`lead_eventos`), SEM copiar o relato nem
--      as anotações — só "de → para" de status, retorno e não-contatar.
--   3. Sessões revogáveis do painel (`crm_sessoes`).
--   4. Contador persistente de tentativas de login (`crm_login_tentativas`).
--
-- PRÉ-REQUISITO: as migrations 0001 a 0003 da LP (zxp-direciona) já devem ter
-- sido aplicadas. Se não, este script PARA no começo, com uma mensagem clara,
-- sem alterar nada.
--
-- ORDEM DE PUBLICAÇÃO: rode isto ANTES de publicar o código do CRM que depende
-- dele. A LP não é afetada: ela só faz INSERT, e todas as colunas novas têm
-- default ou aceitam NULL.
--
-- ROLLBACK: supabase/rollback/crm_0001_rollback.sql

-- ── 0. Pré-requisitos ────────────────────────────────────────────────────
do $$
begin
  if to_regclass('public.leads') is null then
    raise exception 'Tabela public.leads não existe. Rode primeiro o schema.sql da LP.';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'leads'
      and column_name = 'confirmacao_responsavel'
  ) then
    raise exception 'Falta a migration 0001 da LP (confirmacao_responsavel). Rode as migrations da LP, em ordem, antes desta.';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'leads'
      and column_name = 'utm_source'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'leads'
      and column_name = 'referrer_host'
  ) then
    raise exception 'Falta a migration 0003 da LP (origem/utm). Rode as migrations da LP, em ordem, antes desta.';
  end if;
end $$;

-- ── 1. Colunas do CRM em leads ───────────────────────────────────────────
alter table public.leads
  add column if not exists versao integer not null default 1,
  add column if not exists atualizado_em timestamptz,
  add column if not exists proxima_acao_em timestamptz,
  add column if not exists proxima_acao text,
  add column if not exists nao_contatar_em timestamptz;

-- Telefone só com dígitos, mantido pelo próprio banco. O CRM busca por aqui
-- porque `whatsapp` é guardado formatado — "(11) 91234-5678" — e uma busca por
-- "91234" nunca casaria com a máscara.
alter table public.leads
  add column if not exists whatsapp_digitos text
  generated always as (regexp_replace(whatsapp, '\D', '', 'g')) stored;

-- Limites de tamanho. `not valid`: vale para toda escrita nova, sem reprovar
-- (nem reescrever) linha antiga que já exista.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'leads_observacoes_tamanho') then
    alter table public.leads
      add constraint leads_observacoes_tamanho
      check (observacoes is null or char_length(observacoes) <= 5000) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'leads_proxima_acao_tamanho') then
    alter table public.leads
      add constraint leads_proxima_acao_tamanho
      check (proxima_acao is null or char_length(proxima_acao) <= 120) not valid;
  end if;
end $$;

-- Índices pra paginação por cursor (criado_em, id) com e sem filtro de status.
create index if not exists leads_crm_cursor_idx
  on public.leads (criado_em desc, id desc);
create index if not exists leads_crm_status_cursor_idx
  on public.leads (status, criado_em desc, id desc);
create index if not exists leads_crm_retorno_idx
  on public.leads (proxima_acao_em) where proxima_acao_em is not null;

-- ── 1b. Controle de versão (concorrência otimista) ───────────────────────
-- A versão só sobe quando muda algo que o CRM edita. Se subisse em qualquer
-- UPDATE, o aviso por e-mail da LP (que marca `notificado_em`) causaria
-- "conflito" falso na tela de quem está editando o mesmo lead.
create or replace function public.crm_leads_antes_update()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if (new.status, new.observacoes, new.proxima_acao_em, new.proxima_acao, new.nao_contatar_em)
     is distinct from
     (old.status, old.observacoes, old.proxima_acao_em, old.proxima_acao, old.nao_contatar_em)
  then
    new.versao := old.versao + 1;
    new.atualizado_em := now();
  else
    -- Ignora qualquer versão enviada no corpo da requisição: quem manda é o banco.
    new.versao := old.versao;
    new.atualizado_em := old.atualizado_em;
  end if;

  return new;
end;
$$;

drop trigger if exists crm_leads_antes_update on public.leads;
create trigger crm_leads_antes_update
  before update on public.leads
  for each row execute function public.crm_leads_antes_update();

-- ── 2. Histórico curto ───────────────────────────────────────────────────
create table if not exists public.lead_eventos (
  id bigint generated always as identity primary key,
  lead_id uuid not null references public.leads (id) on delete cascade,
  tipo text not null check (tipo in ('status', 'retorno', 'nao_contatar')),
  de text,
  para text,
  criado_em timestamptz not null default now()
);

create index if not exists lead_eventos_lead_idx
  on public.lead_eventos (lead_id, criado_em desc, id desc);

create or replace function public.crm_leads_depois_update()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status is distinct from old.status then
    insert into public.lead_eventos (lead_id, tipo, de, para)
    values (new.id, 'status', old.status, new.status);
  end if;

  if new.proxima_acao_em is distinct from old.proxima_acao_em then
    insert into public.lead_eventos (lead_id, tipo, de, para)
    values (
      new.id, 'retorno',
      to_char(old.proxima_acao_em at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
      to_char(new.proxima_acao_em at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
    );
  end if;

  if (new.nao_contatar_em is null) is distinct from (old.nao_contatar_em is null) then
    insert into public.lead_eventos (lead_id, tipo, de, para)
    values (
      new.id, 'nao_contatar', null,
      case when new.nao_contatar_em is null then 'removido' else 'ativado' end
    );
  end if;

  return null;
end;
$$;

drop trigger if exists crm_leads_depois_update on public.leads;
create trigger crm_leads_depois_update
  after update on public.leads
  for each row execute function public.crm_leads_depois_update();

-- ── 3. Sessões revogáveis ────────────────────────────────────────────────
-- Guarda só o HASH do identificador (sha256 em hex). O valor que vai no cookie
-- nunca fica no banco: quem lesse esta tabela não conseguiria forjar sessão.
-- `credencial` é uma impressão digital da senha em uso: trocar a senha
-- invalida todas as sessões abertas, sem ninguém precisar lembrar de fazê-lo.
create table if not exists public.crm_sessoes (
  id_hash text primary key check (char_length(id_hash) = 64),
  credencial text not null,
  criada_em timestamptz not null default now(),
  expira_em timestamptz not null,
  revogada_em timestamptz
);

create index if not exists crm_sessoes_expira_idx on public.crm_sessoes (expira_em);

-- ── 4. Tentativas de login ───────────────────────────────────────────────
-- `chave` é um HMAC da origem — nunca o IP em texto puro. Linhas somem sozinhas
-- (ver crm_login_falha): sem cron, sem acúmulo.
create table if not exists public.crm_login_tentativas (
  chave text primary key check (char_length(chave) between 16 and 128),
  falhas integer not null,
  ultima_falha_em timestamptz not null,
  bloqueado_ate timestamptz
);

-- Segundos que faltam para a origem poder tentar de novo (0 = liberada).
create or replace function public.crm_login_espera(p_chave text)
returns integer
language sql
stable
set search_path = public
as $$
  select coalesce((
    select ceil(extract(epoch from (bloqueado_ate - now())))::integer
    from public.crm_login_tentativas
    where chave = p_chave and bloqueado_ate > now()
  ), 0);
$$;

-- Registra uma senha errada e devolve quantos segundos a origem fica bloqueada.
-- O upsert trava a linha até o fim da transação, então duas falhas simultâneas
-- nunca perdem um incremento. 3 erros livres; depois 30s, 60s, 120s… até 15 min.
create or replace function public.crm_login_falha(p_chave text)
returns integer
language plpgsql
set search_path = public
as $$
declare
  v_falhas integer;
  v_espera integer;
begin
  if p_chave is null or char_length(p_chave) not between 16 and 128 then
    raise exception 'chave inválida';
  end if;

  insert into public.crm_login_tentativas as t (chave, falhas, ultima_falha_em)
  values (p_chave, 1, now())
  on conflict (chave) do update
    set falhas = case
          when t.ultima_falha_em < now() - interval '1 hour' then 1
          else t.falhas + 1
        end,
        ultima_falha_em = now()
  returning falhas into v_falhas;

  v_espera := case
    when v_falhas > 3
      then least(30 * power(2, least(v_falhas - 4, 5))::integer, 900)
    else 0
  end;

  update public.crm_login_tentativas
     set bloqueado_ate = case
           when v_espera > 0 then now() + make_interval(secs => v_espera)
           else null
         end
   where chave = p_chave;

  -- Limpeza oportunista: o que está parado há um dia não interessa mais.
  delete from public.crm_login_tentativas
   where ultima_falha_em < now() - interval '1 day';

  return v_espera;
end;
$$;

create or replace function public.crm_login_ok(p_chave text)
returns void
language sql
set search_path = public
as $$
  delete from public.crm_login_tentativas where chave = p_chave;
$$;

-- ── 5. Permissões ────────────────────────────────────────────────────────
-- Tudo novo nasce fechado: RLS ligado, nenhuma policy, e nenhum privilégio para
-- as chaves públicas. Só a service_role (servidor) acessa.
alter table public.lead_eventos enable row level security;
alter table public.crm_sessoes enable row level security;
alter table public.crm_login_tentativas enable row level security;

revoke all on table public.lead_eventos from public, anon, authenticated;
revoke all on table public.crm_sessoes from public, anon, authenticated;
revoke all on table public.crm_login_tentativas from public, anon, authenticated;

grant select, insert on table public.lead_eventos to service_role;
grant select, insert, update, delete on table public.crm_sessoes to service_role;
grant select, insert, update, delete on table public.crm_login_tentativas to service_role;

-- Funções: o Supabase concede EXECUTE a anon/authenticated por padrão em
-- funções novas do schema public. Revogar de `public` sozinho não basta.
revoke all on function public.crm_login_espera(text) from public, anon, authenticated;
revoke all on function public.crm_login_falha(text) from public, anon, authenticated;
revoke all on function public.crm_login_ok(text) from public, anon, authenticated;
revoke all on function public.crm_leads_antes_update() from public, anon, authenticated;
revoke all on function public.crm_leads_depois_update() from public, anon, authenticated;

grant execute on function public.crm_login_espera(text) to service_role;
grant execute on function public.crm_login_falha(text) to service_role;
grant execute on function public.crm_login_ok(text) to service_role;
