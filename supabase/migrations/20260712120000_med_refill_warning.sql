-- Aviso de reposição: usuário informa o estoque (comprimidos); o app estima
-- os dias restantes pelo nº de doses/dia (reminder_times, mínimo 1) e avisa
-- por push diário às 09:00 (fuso do perfil) quando faltarem <= 7 dias.

alter table public.medications
  add column if not exists stock_units integer,
  add column if not exists stock_updated_on date;

comment on column public.medications.stock_units is 'Comprimidos/unidades em estoque na data stock_updated_on; null = sem controle de reposição';

create or replace function public.dispatch_med_alarms()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  payload jsonb;
begin
  with ctx as (
    select m.*,
           coalesce(p.timezone, 'America/Sao_Paulo') as tz,
           greatest(coalesce(array_length(m.reminder_times, 1), 1), 1) as dpd
    from public.medications m
    join public.profiles p on p.id = m.user_id
    where m.active
  ),
  due_med as (
    select c.user_id, c.id as med_id, c.name, c.dosage, rt.t,
           (now() at time zone c.tz)::date as local_date
    from ctx c
    cross join lateral unnest(c.reminder_times) as rt(t)
    where c.reminder_times is not null
      and (now() at time zone c.tz)::time >= rt.t::time
      and (now() at time zone c.tz)::time < rt.t::time + interval '10 minutes'
  ),
  due_refill as (
    select c.user_id, c.id as med_id, c.name,
           floor((c.stock_units - ((now() at time zone c.tz)::date - c.stock_updated_on) * c.dpd)::numeric / c.dpd)::int as days_left,
           (now() at time zone c.tz)::date as local_date
    from ctx c
    where c.stock_units is not null
      and c.stock_updated_on is not null
      and (now() at time zone c.tz)::time >= time '09:00'
      and (now() at time zone c.tz)::time < time '09:10'
      and floor((c.stock_units - ((now() at time zone c.tz)::date - c.stock_updated_on) * c.dpd)::numeric / c.dpd) <= 7
  ),
  fresh as (
    insert into public.push_dispatch_log (user_id, kind, ref, sent_on)
    select user_id, 'med', med_id::text || '@' || t, local_date from due_med
    union all
    select user_id, 'refill', med_id::text || '@refill', local_date from due_refill
    on conflict do nothing
    returning user_id, kind, ref
  ),
  messages as (
    select d.user_id, 'med' as kind, d.med_id::text || '@' || d.t as ref,
           '⏰ Hora do medicamento' as title,
           d.name || coalesce(' ' || d.dosage, '') || ' (' || d.t || ')' as body,
           true as critical
    from due_med d
    union all
    select r.user_id, 'refill', r.med_id::text || '@refill',
           '💊 Hora de repor: ' || r.name,
           case
             when r.days_left <= 0 then 'O estoque de ' || r.name || ' pode ter acabado. Compre hoje e atualize o estoque no app.'
             else 'Estoque de ' || r.name || ' para ~' || r.days_left || ' dia(s). Programe a compra.'
           end,
           false
    from due_refill r
  )
  select jsonb_agg(jsonb_build_object(
    'endpoint', s.endpoint,
    'p256dh', s.p256dh,
    'auth', s.auth,
    'title', msg.title,
    'body', msg.body,
    'critical', msg.critical
  ))
  into payload
  from fresh f
  join messages msg on msg.user_id = f.user_id and msg.kind = f.kind and msg.ref = f.ref
  join public.push_subscriptions s on s.user_id = msg.user_id;

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
