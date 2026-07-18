-- O CRON_SECRET real ficava em texto puro dentro desta função (commitado no
-- git em 20260714120000_cgm_sync_dispatcher.sql). Passa a ler o segredo do
-- Supabase Vault (tabela vault.decrypted_secrets, só acessível a roles
-- elevadas) em vez de um literal na definição da função.
--
-- Setup manual necessário em cada projeto Supabase (rodar uma vez no SQL
-- Editor, com o MESMO valor configurado como CRON_SECRET no Vercel):
--   select vault.create_secret('<valor-do-cron-secret>', 'cgm_cron_secret');

create or replace function public.dispatch_cgm_sync()
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  cron_secret text;
begin
  select decrypted_secret into cron_secret
  from vault.decrypted_secrets
  where name = 'cgm_cron_secret'
  limit 1;

  if cron_secret is null then
    raise exception 'Segredo cgm_cron_secret ausente no Vault.';
  end if;

  perform net.http_post(
    url := 'https://glyx-sistema-inteligente-de-control.vercel.app/api/cgm/sync-dispatch',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', cron_secret
    ),
    body := '{}'::jsonb
  );
end;
$function$;

revoke execute on function public.dispatch_cgm_sync() from public, anon, authenticated;
