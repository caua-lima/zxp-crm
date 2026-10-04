-- Inspeção de segurança do banco — SOMENTE LEITURA. Rode no SQL Editor depois
-- de aplicar as migrations. Nada aqui altera dado.
--
-- O README do projeto AFIRMA que a tabela de leads tem RLS ligado e nenhuma
-- policy. Esta consulta é o que COMPROVA isso no banco real.
--
-- Resultado esperado está comentado ao lado de cada bloco. Qualquer linha fora
-- do esperado é achado: não "corrija" apagando policy sem entender de onde ela
-- veio.

-- 1) RLS ligado nas tabelas que guardam dado pessoal ou controle de acesso.
--    ESPERADO: rls_ligada = true nas 5 linhas.
select c.relname as tabela, c.relrowsecurity as rls_ligada
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('leads', 'lead_eventos', 'crm_sessoes', 'crm_login_tentativas', 'rate_limit_hits')
order by c.relname;

-- 2) Policies existentes.
--    ESPERADO: ZERO linhas. Qualquer policy aqui abre acesso às chaves públicas.
select schemaname, tablename, policyname, roles, cmd
from pg_policies
where schemaname = 'public'
order by tablename, policyname;

-- 3) Privilégios de tabela das roles públicas.
--    ESPERADO: ZERO linhas para lead_eventos, crm_sessoes, crm_login_tentativas.
--    Para `leads` e `rate_limit_hits`, privilégios aparecerem aqui são toleráveis
--    SOMENTE porque o RLS está ligado e sem policy (o acesso continua negado) —
--    mas é a camada fraca: se alguém desligar o RLS, a tabela abre. Anote.
select grantee, table_name, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee in ('anon', 'authenticated', 'PUBLIC')
  and table_name in ('leads', 'lead_eventos', 'crm_sessoes', 'crm_login_tentativas', 'rate_limit_hits')
order by table_name, grantee, privilege_type;

-- 4) EXECUTE das funções do CRM para as roles públicas.
--    ESPERADO: ZERO linhas.
select p.proname as funcao, r.rolname as role
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
cross join (select rolname from pg_roles where rolname in ('anon', 'authenticated')) r
where n.nspname = 'public'
  and p.proname like 'crm\_%'
  and has_function_privilege(r.rolname, p.oid, 'EXECUTE')
order by p.proname, r.rolname;

-- 5) A prova direta: as chaves públicas NÃO leem leads.
--    ESPERADO: false e false.
select has_table_privilege('anon', 'public.leads', 'SELECT') as anon_le_privilegio,
       has_table_privilege('authenticated', 'public.leads', 'SELECT') as authenticated_le_privilegio;
-- (Tabela com RLS e sem policy devolve zero linhas mesmo com o privilégio; o
--  teste definitivo é pedir /rest/v1/leads com a chave `anon` e receber `[]`.)

-- 6) Constraints e colunas novas existem.
--    ESPERADO: 5 colunas (+ whatsapp_digitos) e as duas constraints.
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'leads'
  and column_name in ('versao', 'atualizado_em', 'proxima_acao_em', 'proxima_acao', 'nao_contatar_em', 'whatsapp_digitos')
order by column_name;

select conname, convalidated
from pg_constraint
where conname in ('leads_observacoes_tamanho', 'leads_proxima_acao_tamanho');
