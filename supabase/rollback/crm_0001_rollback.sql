-- Rollback de crm_0001.
--
-- ⚠️ DESTRUTIVO para o que o CRM criou: apaga o histórico de eventos, as
-- sessões, o contador de login e as colunas versao / atualizado_em /
-- proxima_acao_em / proxima_acao / nao_contatar_em. NÃO toca em nenhuma coluna
-- da LP (nome, whatsapp, contexto, utm_*, ...), nem apaga lead.
--
-- Antes de rodar: reverta o código do CRM (ele depende destas colunas) e, se
-- houver `proxima_acao_em` / `nao_contatar_em` preenchidos que você queira
-- guardar, exporte-os. `nao_contatar_em` é um pedido da PESSOA para não ser
-- contatada: perdê-lo não pode virar contato indevido.

drop trigger if exists crm_leads_depois_update on public.leads;
drop trigger if exists crm_leads_antes_update on public.leads;
drop function if exists public.crm_leads_depois_update();
drop function if exists public.crm_leads_antes_update();

drop function if exists public.crm_login_ok(text);
drop function if exists public.crm_login_falha(text);
drop function if exists public.crm_login_espera(text);

drop table if exists public.crm_login_tentativas;
drop table if exists public.crm_sessoes;
drop table if exists public.lead_eventos;

drop index if exists public.leads_crm_cursor_idx;
drop index if exists public.leads_crm_status_cursor_idx;
drop index if exists public.leads_crm_retorno_idx;

alter table public.leads drop constraint if exists leads_observacoes_tamanho;
alter table public.leads drop constraint if exists leads_proxima_acao_tamanho;

alter table public.leads
  drop column if exists whatsapp_digitos,
  drop column if exists nao_contatar_em,
  drop column if exists proxima_acao,
  drop column if exists proxima_acao_em,
  drop column if exists atualizado_em,
  drop column if exists versao;
