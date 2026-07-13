-- Adiar alarme de medicação (snooze) + dica diária de nutrição via push.

create table if not exists public.medication_snoozes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  medication_id uuid not null references public.medications (id) on delete cascade,
  snoozed_until timestamptz not null,
  fired boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists medication_snoozes_due_idx
  on public.medication_snoozes (snoozed_until) where not fired;

alter table public.medication_snoozes enable row level security;

create policy "medication_snoozes_own"
  on public.medication_snoozes for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- dispatch_med_alarms() ganha uma segunda etapa: dispara snoozes vencidos
-- (corpo completo replicado aqui para reprodutibilidade do schema).
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
        'x-cron-secret', 'glyx-cron-7f3a9d2e8b4c1f6a5e0d9c8b7a6f5e4d'
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
        'x-cron-secret', 'glyx-cron-7f3a9d2e8b4c1f6a5e0d9c8b7a6f5e4d'
      ),
      body := snooze_payload
    );
  end if;
end;
$function$;

-- Dica diária de nutrição/glicemia — mesmo público que já ativou alarmes.
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
        'x-cron-secret', 'glyx-cron-7f3a9d2e8b4c1f6a5e0d9c8b7a6f5e4d'
      ),
      body := payload
    );
  end if;
end;
$function$;

select cron.schedule('glyx-daily-tip', '0 12 * * *', 'select public.dispatch_daily_tip()');
