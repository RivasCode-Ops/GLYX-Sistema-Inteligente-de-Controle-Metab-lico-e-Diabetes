-- Sincronização periódica do CGM (LibreLinkUp) em segundo plano. Antes disso
-- a única sincronização acontecia quando o usuário abria o dashboard (com
-- trava de 5 min) — sem ninguém olhando o app, glucose_readings parava de
-- receber leituras novas do sensor. A rota /api/cgm/sync-dispatch faz o
-- trabalho pesado (decripta credenciais, chama a LibreLinkUp, ingere
-- leituras de TODOS os usuários conectados) usando a service role key;
-- esta função só dispara a chamada.
create or replace function public.dispatch_cgm_sync()
returns void
language plpgsql
security definer
set search_path = public
as $function$
begin
  perform net.http_post(
    url := 'https://glyx-sistema-inteligente-de-control.vercel.app/api/cgm/sync-dispatch',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', 'glyx-cron-62f0f18d01497a7cacf39af3d482ee3972456a6a9d98c0fa5dfcc19a4d52f05c'
    ),
    body := '{}'::jsonb
  );
end;
$function$;

revoke execute on function public.dispatch_cgm_sync() from public, anon, authenticated;

-- A cada 15 min — o sensor Libre atualiza a cada ~1 min, mas a API do
-- LibreLinkUp já é consultada com trava de 10 min dentro da própria rota
-- (evita bater na Abbott com frequência excessiva / limitar por conta).
select cron.schedule('glyx-cgm-sync', '*/15 * * * *', 'select public.dispatch_cgm_sync()');
