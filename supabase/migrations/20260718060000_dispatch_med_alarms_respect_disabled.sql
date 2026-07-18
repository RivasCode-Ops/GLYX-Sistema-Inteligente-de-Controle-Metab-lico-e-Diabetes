-- dispatch_med_alarms() checava m.active mas nunca p.disabled, diferente
-- das outras 3 funções de dispatch (daily_tip, water_reminder,
-- meal_suggestions), que já filtram "not p.disabled". Uma conta suspensa
-- pelo admin continuava recebendo alarme critico de medicacao e aviso de
-- reposicao de estoque normalmente.
create or replace function public.dispatch_med_alarms()
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  payload jsonb;
  snooze_payload jsonb;
  cron_secret text;
begin
  select decrypted_secret into cron_secret from vault.decrypted_secrets where name = 'cgm_cron_secret' limit 1;
  if cron_secret is null then
    raise exception 'Segredo cgm_cron_secret ausente no Vault.';
  end if;

  with ctx as (
    select m.*,
           coalesce(p.timezone, 'America/Sao_Paulo') as tz,
           greatest(coalesce(array_length(m.reminder_times, 1), 1), 1) as dpd
    from public.medications m
    join public.profiles p on p.id = m.user_id
    where m.active
      and not p.disabled
  ),
  due_med as (
    select c.user_id, c.id as med_id, c.name, c.dosage, c.kind, rt.t,
           (now() at time zone c.tz)::date as local_date
    from ctx c
    cross join lateral unnest(c.reminder_times) as rt(t)
    where c.reminder_times is not null
      and (now() at time zone c.tz)::time >= rt.t::time
      and (now() at time zone c.tz)::time < rt.t::time + interval '10 minutes'
  ),
  due_refill as (
    select c.user_id, c.id as med_id, c.name, c.kind,
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
           d.med_id::text as med_id,
           case when d.kind = 'supplement' then '💪 Hora do suplemento' else '⏰ Hora do medicamento' end as title,
           d.name || coalesce(' ' || d.dosage, '') || ' (' || d.t || ')' as body,
           (d.kind <> 'supplement') as critical
    from due_med d
    union all
    select r.user_id, 'refill', r.med_id::text || '@refill',
           null::text as med_id,
           case when r.kind = 'supplement' then '🛒 Hora de repor: ' || r.name else '💊 Hora de repor: ' || r.name end,
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
    'critical', msg.critical,
    'medId', msg.med_id
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
        'x-cron-secret', cron_secret
      ),
      body := payload
    );
  end if;

  with due_snooze as (
    select s.id, s.user_id, s.medication_id, m.name, m.dosage, m.kind
    from public.medication_snoozes s
    join public.medications m on m.id = s.medication_id
    join public.profiles p on p.id = s.user_id
    where not s.fired and s.snoozed_until <= now() and not p.disabled
  ),
  marked as (
    update public.medication_snoozes
    set fired = true
    where id in (select id from due_snooze)
    returning id
  )
  select jsonb_agg(jsonb_build_object(
    'endpoint', sub.endpoint,
    'p256dh', sub.p256dh,
    'auth', sub.auth,
    'title', case when ds.kind = 'supplement' then '💪 Lembrete adiado' else '⏰ Lembrete adiado' end,
    'body', ds.name || coalesce(' ' || ds.dosage, '') || ' — hora de tomar agora',
    'critical', (ds.kind <> 'supplement'),
    'medId', ds.medication_id::text
  ))
  into snooze_payload
  from due_snooze ds
  join public.push_subscriptions sub on sub.user_id = ds.user_id
  where ds.id in (select id from marked);

  if snooze_payload is not null then
    perform net.http_post(
      url := 'https://glyx-sistema-inteligente-de-control.vercel.app/api/push/dispatch',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', cron_secret
      ),
      body := snooze_payload
    );
  end if;
end;
$function$;
