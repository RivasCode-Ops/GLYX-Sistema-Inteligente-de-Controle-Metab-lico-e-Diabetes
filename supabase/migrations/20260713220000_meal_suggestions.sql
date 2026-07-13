-- Sugestão personalizada por IA quando o usuário não registra refeição
-- no horário de café/almoço/jantar. Diferente dos demais dispatchers,
-- este precisa chamar a OpenAI (Postgres não faz isso sozinho): a
-- função identifica quem está "devendo" o registro, embute todo o
-- contexto necessário no payload e delega a chamada de IA + envio do
-- push para /api/meals/suggest-dispatch (autenticado por CRON_SECRET).

alter table public.ai_usage drop constraint if exists ai_usage_kind_check;
alter table public.ai_usage add constraint ai_usage_kind_check
  check (kind in ('chat', 'meal_photo', 'exam', 'supplement', 'meal_suggest'));

-- RPC secreta (não depende de auth.uid()) para registrar gasto de IA de
-- ações disparadas pelo cron, sem precisar de service role key.
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
  if p_secret <> 'glyx-cron-7f3a9d2e8b4c1f6a5e0d9c8b7a6f5e4d' then
    raise exception 'unauthorized';
  end if;
  insert into public.ai_usage (user_id, kind, prompt_tokens, completion_tokens, model)
  values (p_user_id, p_kind, p_prompt_tokens, p_completion_tokens, p_model);
end;
$function$;

grant execute on function public.record_system_ai_usage(uuid, text, int, int, text, text) to anon, authenticated;

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
        'x-cron-secret', 'glyx-cron-7f3a9d2e8b4c1f6a5e0d9c8b7a6f5e4d'
      ),
      body := payload
    );
  end if;
end;
$function$;

select cron.schedule('glyx-meal-suggest', '*/15 * * * *', 'select public.dispatch_meal_suggestions()');
