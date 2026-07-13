-- Registro de água + lembrete periódico, e detecção de pico glicêmico
-- pós-refeição (usa leituras reais do CGM/Libre quando disponíveis).

create table if not exists public.water_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  amount_ml int not null check (amount_ml > 0 and amount_ml <= 5000),
  logged_at timestamptz not null default now()
);

create index if not exists water_logs_user_date_idx
  on public.water_logs (user_id, logged_at desc);

alter table public.water_logs enable row level security;

create policy "water_logs_own"
  on public.water_logs for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Lembrete a cada ~2h entre 08h e 20h no fuso do perfil.
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
        'x-cron-secret', 'glyx-cron-7f3a9d2e8b4c1f6a5e0d9c8b7a6f5e4d'
      ),
      body := payload
    );
  end if;
end;
$function$;

select cron.schedule('glyx-water-reminder', '*/30 * * * *', 'select public.dispatch_water_reminder()');

alter table public.meals
  add column if not exists glucose_spike boolean;

comment on column public.meals.glucose_spike is 'null=ainda nao avaliado ou sem leituras; true=pico detectado 0-2h apos comer; false=avaliado, sem pico';

-- Marca refeições cuja glicemia subiu >=50 mg/dL do valor anterior, ou
-- ultrapassou 180 mg/dL, dentro de 2h após o horário registrado.
create or replace function public.evaluate_meal_glucose_spikes()
returns void
language plpgsql
security definer
set search_path = public
as $function$
begin
  with candidates as (
    select m.id, m.user_id, m.eaten_at
    from public.meals m
    where m.glucose_spike is null
      and m.eaten_at <= now() - interval '2 hours'
      and m.eaten_at >= now() - interval '26 hours'
  ),
  baseline as (
    select c.id,
           (select g.value_mg_dl from public.glucose_readings g
            where g.user_id = c.user_id and g.recorded_at <= c.eaten_at
            order by g.recorded_at desc limit 1) as before_value,
           (select max(g.value_mg_dl) from public.glucose_readings g
            where g.user_id = c.user_id
              and g.recorded_at > c.eaten_at
              and g.recorded_at <= c.eaten_at + interval '2 hours') as peak_value,
           (select count(*) from public.glucose_readings g
            where g.user_id = c.user_id
              and g.recorded_at > c.eaten_at
              and g.recorded_at <= c.eaten_at + interval '2 hours') as reading_count
    from candidates c
  )
  update public.meals m
  set glucose_spike = (
    b.peak_value is not null and (
      b.peak_value >= 180
      or (b.before_value is not null and b.peak_value - b.before_value >= 50)
    )
  )
  from baseline b
  where m.id = b.id and b.reading_count > 0;
end;
$function$;

select cron.schedule('glyx-glucose-spike-eval', '*/30 * * * *', 'select public.evaluate_meal_glucose_spikes()');
