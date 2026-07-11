-- Despachante de alarmes de medicação: pg_cron consulta doses vencidas
-- (fuso do perfil), deduplica via push_dispatch_log e envia ao endpoint
-- /api/push/dispatch (que só entrega os pushes — sem service role no web).

create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function public.dispatch_med_alarms()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  payload jsonb;
begin
  with due as (
    select
      m.user_id,
      m.id as med_id,
      m.name,
      m.dosage,
      rt.t,
      (now() at time zone coalesce(p.timezone, 'America/Sao_Paulo'))::date as local_date
    from public.medications m
    join public.profiles p on p.id = m.user_id
    cross join lateral unnest(m.reminder_times) as rt(t)
    where m.active
      and m.reminder_times is not null
      and (now() at time zone coalesce(p.timezone, 'America/Sao_Paulo'))::time >= rt.t::time
      and (now() at time zone coalesce(p.timezone, 'America/Sao_Paulo'))::time
          < rt.t::time + interval '10 minutes'
  ),
  fresh as (
    insert into public.push_dispatch_log (user_id, kind, ref, sent_on)
    select user_id, 'med', med_id::text || '@' || t, local_date
    from due
    on conflict do nothing
    returning user_id, ref
  )
  select jsonb_agg(jsonb_build_object(
    'endpoint', s.endpoint,
    'p256dh', s.p256dh,
    'auth', s.auth,
    'title', '⏰ Hora do medicamento',
    'body', d.name || coalesce(' ' || d.dosage, '') || ' (' || d.t || ')',
    'critical', true
  ))
  into payload
  from fresh f
  join due d on d.user_id = f.user_id and (d.med_id::text || '@' || d.t) = f.ref
  join public.push_subscriptions s on s.user_id = d.user_id;

  if payload is not null then
    perform net.http_post(
      url := 'https://glyx-sistema-inteligente-de-control.vercel.app/api/push/dispatch',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', 'glyx-cron-7f3a9d2e8b4c1f6a5e0d9c8b7a6f5e4d'
      ),
      body := payload
    );
  end if;
end;
$$;

-- Só o agendador interno executa; nunca via API
revoke execute on function public.dispatch_med_alarms() from public;
revoke execute on function public.dispatch_med_alarms() from anon;
revoke execute on function public.dispatch_med_alarms() from authenticated;

select cron.schedule('glyx-med-alarms', '*/5 * * * *', 'select public.dispatch_med_alarms()');
