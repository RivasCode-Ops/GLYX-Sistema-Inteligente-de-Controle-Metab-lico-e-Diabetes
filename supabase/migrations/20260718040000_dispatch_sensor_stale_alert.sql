-- Alerta proativo: a conexão do sensor pode estar "saudável" (sync sem erro,
-- circuit breaker fechado) mas sem leitura nova de verdade há muito tempo —
-- isso já aconteceu (Bluetooth desligado no celular). Hoje só o SensorRadar
-- no dashboard mostra isso, e só quando o usuário abre o app. Esta função
-- roda a cada 15 min e avisa por push, uma vez por dia por usuário.
create or replace function public.dispatch_sensor_stale_alert()
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  payload jsonb;
  cron_secret text;
begin
  select decrypted_secret into cron_secret
  from vault.decrypted_secrets
  where name = 'cgm_cron_secret'
  limit 1;

  if cron_secret is null then
    raise exception 'Segredo cgm_cron_secret ausente no Vault.';
  end if;

  with ctx as (
    select distinct c.user_id, coalesce(p.timezone, 'America/Sao_Paulo') as tz
    from public.cgm_connections c
    join public.profiles p on p.id = c.user_id and not p.disabled
    where c.last_error is null
      and (c.circuit_open_until is null or c.circuit_open_until <= now())
  ),
  latest_reading as (
    select g.user_id, max(g.recorded_at) as last_at
    from public.glucose_readings g
    where g.user_id in (select user_id from ctx)
    group by g.user_id
  ),
  stale as (
    select c.user_id, c.tz
    from ctx c
    join latest_reading lr on lr.user_id = c.user_id
    where lr.last_at < now() - interval '20 minutes'
  ),
  fresh as (
    insert into public.push_dispatch_log (user_id, kind, ref, sent_on)
    select user_id, 'sensor_stale', 'stale', (now() at time zone tz)::date
    from stale
    on conflict do nothing
    returning user_id
  )
  select jsonb_agg(jsonb_build_object(
    'endpoint', s.endpoint,
    'p256dh', s.p256dh,
    'auth', s.auth,
    'title', '📡 Sensor sem leitura nova',
    'body', 'O sensor está conectado e sem erro, mas sem leitura nova há um tempo — confira o Bluetooth e se o app do sensor está aberto no celular.',
    'critical', false
  ))
  into payload
  from fresh f
  join public.push_subscriptions s on s.user_id = f.user_id;

  if payload is not null then
    perform net.http_post(
      url := 'https://glyx-sistema-inteligente-de-control.vercel.app/api/push/dispatch',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', cron_secret
      ),
      body := payload
    );
  end if;
end;
$function$;

revoke execute on function public.dispatch_sensor_stale_alert() from public, anon, authenticated;

select cron.schedule('glyx-sensor-stale-alert', '*/15 * * * *', 'select public.dispatch_sensor_stale_alert()');
