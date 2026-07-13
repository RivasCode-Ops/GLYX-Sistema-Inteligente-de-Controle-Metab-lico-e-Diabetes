-- Auditoria de segurança pré-produção (2026-07-13):
-- 1) O CRON_SECRET anterior estava versionado em texto puro em vários
--    commits (repositório público) — rotacionado aqui em todas as
--    funções que o embutem.
-- 2) dispatch_med_alarms/dispatch_daily_tip/dispatch_water_reminder/
--    dispatch_meal_suggestions/evaluate_meal_glucose_spikes ficavam
--    executáveis via /rest/v1/rpc/... por qualquer usuário anônimo
--    (grant PUBLIC implícito do Postgres) sem checagem interna —
--    bloqueado via REVOKE. Só pg_cron (role postgres/owner) precisa
--    chamá-las.

create or replace function public.dispatch_med_alarms()
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  payload jsonb;
  snooze_payload jsonb;
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
        'x-cron-secret', 'glyx-cron-62f0f18d01497a7cacf39af3d482ee3972456a6a9d98c0fa5dfcc19a4d52f05c'
      ),
      body := payload
    );
  end if;

  with due_snooze as (
    select s.id, s.user_id, s.medication_id, m.name, m.dosage, m.kind
    from public.medication_snoozes s
    join public.medications m on m.id = s.medication_id
    where not s.fired and s.snoozed_until <= now()
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
        'x-cron-secret', 'glyx-cron-62f0f18d01497a7cacf39af3d482ee3972456a6a9d98c0fa5dfcc19a4d52f05c'
      ),
      body := snooze_payload
    );
  end if;
end;
$function$;

create or replace function public.dispatch_daily_tip()
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  payload jsonb;
  tips text[] := array[
    'Prefira frutas inteiras em vez de sucos — a fibra reduz o pico de glicose.',
    'Leia os rótulos: açúcar pode aparecer como maltodextrina, xarope de milho ou dextrose.',
    'Evite adoçar bebidas sempre que possível — é açúcar puro e rápido na corrente sanguínea.',
    'Reduza ultraprocessados: costumam ter açúcar escondido mesmo em produtos salgados.',
    'Se comer doce, prefira logo após uma refeição — o efeito na glicemia é menor do que em jejum.',
    'Ordem importa: comer vegetais e proteína antes do carboidrato reduz o pico de glicose.',
    'Carga glicêmica conta mais que só a quantidade de carboidrato — prefira grãos integrais.',
    'Reserve doces para ocasiões especiais, se fizerem parte do seu plano alimentar.',
    'Beba água ao longo do dia — desidratação leve já eleva a concentração de glicose no sangue.'
  ];
  today_ref text := to_char(current_date, 'YYYY-MM-DD');
  tip text;
begin
  tip := tips[1 + (extract(doy from now())::int % array_length(tips, 1))];

  with fresh as (
    insert into public.push_dispatch_log (user_id, kind, ref, sent_on)
    select distinct ps.user_id, 'tip', today_ref, current_date
    from public.push_subscriptions ps
    join public.profiles p on p.id = ps.user_id and not p.disabled
    on conflict do nothing
    returning user_id
  )
  select jsonb_agg(jsonb_build_object(
    'endpoint', s.endpoint,
    'p256dh', s.p256dh,
    'auth', s.auth,
    'title', '💡 Dica do dia',
    'body', tip,
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
        'x-cron-secret', 'glyx-cron-62f0f18d01497a7cacf39af3d482ee3972456a6a9d98c0fa5dfcc19a4d52f05c'
      ),
      body := payload
    );
  end if;
end;
$function$;

create or replace function public.dispatch_water_reminder()
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  payload jsonb;
begin
  with ctx as (
    select p.id as user_id, coalesce(p.timezone, 'America/Sao_Paulo') as tz
    from public.profiles p
    where not p.disabled
  ),
  due as (
    select c.user_id,
           (now() at time zone c.tz)::date as local_date,
           extract(hour from (now() at time zone c.tz))::int as local_hour
    from ctx c
    where extract(hour from (now() at time zone c.tz))::int in (8,10,12,14,16,18,20)
      and extract(minute from (now() at time zone c.tz))::int < 30
  ),
  fresh as (
    insert into public.push_dispatch_log (user_id, kind, ref, sent_on)
    select user_id, 'water', local_date::text || ':' || local_hour, local_date
    from due
    on conflict do nothing
    returning user_id
  )
  select jsonb_agg(jsonb_build_object(
    'endpoint', s.endpoint,
    'p256dh', s.p256dh,
    'auth', s.auth,
    'title', '💧 Hora de beber água',
    'body', 'Mantenha-se hidratado — registre um copo no GLYX.',
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
        'x-cron-secret', 'glyx-cron-62f0f18d01497a7cacf39af3d482ee3972456a6a9d98c0fa5dfcc19a4d52f05c'
      ),
      body := payload
    );
  end if;
end;
$function$;

create or replace function public.record_system_ai_usage(
  p_user_id uuid,
  p_kind text,
  p_prompt_tokens int,
  p_completion_tokens int,
  p_model text,
  p_secret text
)
returns void
language plpgsql
security definer
set search_path = public
as $function$
begin
  if p_secret <> 'glyx-cron-62f0f18d01497a7cacf39af3d482ee3972456a6a9d98c0fa5dfcc19a4d52f05c' then
    raise exception 'unauthorized';
  end if;
  insert into public.ai_usage (user_id, kind, prompt_tokens, completion_tokens, model)
  values (p_user_id, p_kind, p_prompt_tokens, p_completion_tokens, p_model);
end;
$function$;

create or replace function public.dispatch_meal_suggestions()
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  payload jsonb;
begin
  with ctx as (
    select p.id as user_id, coalesce(p.timezone, 'America/Sao_Paulo') as tz,
           p.body_goal, p.diabetes_type
    from public.profiles p
    where not p.disabled
  ),
  windows(meal_type, win_start, win_end) as (
    values
      ('breakfast', time '07:00', time '09:00'),
      ('lunch', time '11:30', time '14:00'),
      ('dinner', time '18:00', time '20:30')
  ),
  candidates as (
    select c.user_id, c.tz, c.body_goal, c.diabetes_type,
           w.meal_type, w.win_start, w.win_end,
           (now() at time zone c.tz)::date as local_date
    from ctx c
    cross join windows w
    where (now() at time zone c.tz)::time >= (w.win_end - interval '15 minutes')
      and (now() at time zone c.tz)::time < w.win_end
  ),
  due as (
    select cd.*
    from candidates cd
    where not exists (
      select 1 from public.meals m
      where m.user_id = cd.user_id
        and (m.eaten_at at time zone cd.tz)::date = cd.local_date
        and (m.eaten_at at time zone cd.tz)::time >= cd.win_start
        and (m.eaten_at at time zone cd.tz)::time < cd.win_end
    )
    and exists (select 1 from public.push_subscriptions s where s.user_id = cd.user_id)
  ),
  fresh as (
    insert into public.push_dispatch_log (user_id, kind, ref, sent_on)
    select user_id, 'meal_suggest', local_date::text || ':' || meal_type, local_date
    from due
    on conflict do nothing
    returning user_id, ref
  ),
  enriched as (
    select f.user_id, f.ref,
           split_part(f.ref, ':', 2) as meal_type,
           d.body_goal, d.diabetes_type,
           (select g.value_mg_dl from public.glucose_readings g
            where g.user_id = f.user_id order by g.recorded_at desc limit 1) as latest_glucose,
           (select coalesce(sum(m.calories), 0) from public.meals m
            where m.user_id = f.user_id and (m.eaten_at at time zone d.tz)::date = d.local_date) as calories_today,
           (select coalesce(sum(m.carbs_g), 0) from public.meals m
            where m.user_id = f.user_id and (m.eaten_at at time zone d.tz)::date = d.local_date) as carbs_today
    from fresh f
    join due d on d.user_id = f.user_id
      and (d.local_date::text || ':' || d.meal_type) = f.ref
  )
  select jsonb_agg(jsonb_build_object(
    'userId', e.user_id,
    'mealType', e.meal_type,
    'bodyGoal', e.body_goal,
    'diabetesType', e.diabetes_type,
    'latestGlucose', e.latest_glucose,
    'caloriesToday', e.calories_today,
    'carbsToday', e.carbs_today,
    'endpoint', s.endpoint,
    'p256dh', s.p256dh,
    'auth', s.auth
  ))
  into payload
  from enriched e
  join public.push_subscriptions s on s.user_id = e.user_id;

  if payload is not null then
    perform net.http_post(
      url := 'https://glyx-sistema-inteligente-de-control.vercel.app/api/meals/suggest-dispatch',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', 'glyx-cron-62f0f18d01497a7cacf39af3d482ee3972456a6a9d98c0fa5dfcc19a4d52f05c'
      ),
      body := payload
    );
  end if;
end;
$function$;

revoke execute on function public.dispatch_med_alarms() from public, anon, authenticated;
revoke execute on function public.dispatch_daily_tip() from public, anon, authenticated;
revoke execute on function public.dispatch_water_reminder() from public, anon, authenticated;
revoke execute on function public.dispatch_meal_suggestions() from public, anon, authenticated;
revoke execute on function public.evaluate_meal_glucose_spikes() from public, anon, authenticated;
