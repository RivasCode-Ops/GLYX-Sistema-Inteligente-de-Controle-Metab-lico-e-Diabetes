-- URL de produção sai do literal e vai para o Vault.
--
-- As 6 funções de cron chamavam `https://glyx-sistema-inteligente-de-control.vercel.app/api/...`
-- em literal. Trocar de domínio quebrava TODO o agendamento em silêncio: nenhum
-- job falha visivelmente, eles simplesmente passam a chamar um host que não
-- responde — e push de medicação, sync de CGM e alerta de sensor parado somem
-- sem erro nenhum em lugar nenhum.
--
-- Por que transformar a definição existente em vez de reescrever cada corpo:
-- são 6 funções com lógica de janela horária, dedupe e agregação de payload.
-- Redigitar cada uma para trocar uma string é a forma mais fácil de introduzir
-- um bug sutil numa função que ninguém olha até o dia em que o push não chega.
-- `pg_get_functiondef` devolve DDL válida; a troca textual é cirúrgica e o
-- corpo continua byte a byte o mesmo no resto.

-- 1. Helper. Sem o segredo no Vault, devolve exatamente a URL de hoje — assim
-- um ambiente novo (ou um Vault vazio) continua funcionando igual ao anterior,
-- e a troca de domínio passa a ser uma linha no Vault.
create or replace function public.app_base_url()
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v text;
begin
  select decrypted_secret into v from vault.decrypted_secrets where name = 'app_base_url' limit 1;
  return coalesce(
    nullif(rtrim(coalesce(v, ''), '/'), ''),
    'https://glyx-sistema-inteligente-de-control.vercel.app'
  );
end;
$$;

comment on function public.app_base_url() is
  'Base URL do app para as funções de cron. Vem do Vault (app_base_url); sem o segredo, cai no domínio atual. Trocar de domínio = atualizar esse segredo.';

-- Lê Vault: não deve ser executável por quem chega pela API pública. As funções
-- de cron são SECURITY DEFINER e a chamam como dono, então isso não as afeta.
revoke all on function public.app_base_url() from public;
revoke all on function public.app_base_url() from anon;
revoke all on function public.app_base_url() from authenticated;

-- 2. Semeia o segredo com o domínio atual, se ainda não existir.
do $seed$
begin
  if not exists (select 1 from vault.secrets where name = 'app_base_url') then
    perform vault.create_secret(
      'https://glyx-sistema-inteligente-de-control.vercel.app',
      'app_base_url',
      'Base URL chamada pelas funções de cron (pg_net). Trocar aqui ao mudar de domínio.'
    );
  end if;
end;
$seed$;

-- 3. Troca o literal pela chamada ao helper em toda função que ainda o contém.
-- Idempotente: depois da primeira execução o literal não existe mais, e o laço
-- não encontra nada para transformar.
do $rewrite$
declare
  fn record;
  new_def text;
  changed int := 0;
begin
  for fn in
    select p.oid, p.proname, pg_get_functiondef(p.oid) as def
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
      and p.proname <> 'app_base_url'
      and pg_get_functiondef(p.oid) like '%''https://glyx-sistema-inteligente-de-control.vercel.app/api/%'
  loop
    -- 'https://host/api/x'  ->  public.app_base_url() || '/api/x'
    new_def := replace(
      fn.def,
      '''https://glyx-sistema-inteligente-de-control.vercel.app/api/',
      'public.app_base_url() || ''/api/'
    );
    execute new_def;
    changed := changed + 1;
    raise notice 'app_base_url aplicado em %', fn.proname;
  end loop;

  raise notice 'Funções de cron atualizadas: %', changed;
end;
$rewrite$;
