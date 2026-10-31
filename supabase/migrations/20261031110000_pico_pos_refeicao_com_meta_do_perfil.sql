-- Etapa 2, B9: pico pós-refeição com a meta do PERFIL e base "antes" com
-- limite de tempo.
--
-- O job marcava pico com 180 fixo (>= 180) e usava como "antes" a última
-- leitura anterior à refeição, de qualquer idade: com o sensor parado desde a
-- véspera, a base era de 14 h antes e o delta não media a refeição. Agora:
--   * acima da meta = valor > meta máxima do perfil (mesma régua do app, B4;
--     faixa incoerente cai inteira no padrão 70–180, como resolveGlucoseTargets);
--   * base = última leitura até 30 min antes da refeição (sem ela, só o critério
--     de meta vale — não se inventa delta);
--   * leituras de demonstração (source = 'mock') não entram (B12).
-- O delta de +50 mg/dL fica como estava (critério clínico, D7).

create or replace function public.glyx_meta_maxima(p_min integer, p_max integer)
returns integer
language sql
immutable
set search_path = public
as $$
  -- Espelho de isCoherentTargetRange (lib/health/glucose-thresholds.ts).
  select case
    when p_min is not null and p_max is not null
         and p_min between 60 and 130
         and p_max between 100 and 300
         and p_max - p_min >= 20
      then p_max
    else 180
  end;
$$;

comment on function public.glyx_meta_maxima(integer, integer) is
  'Meta máxima efetiva do perfil; faixa incoerente cai no padrão 180 (espelho de resolveGlucoseTargets).';

create or replace function public.evaluate_meal_glucose_spikes()
returns void
language plpgsql
security definer
set search_path = public
as $function$
begin
  with candidates as (
    select m.id, m.user_id, m.eaten_at,
           public.glyx_meta_maxima(p.target_glucose_min, p.target_glucose_max) as meta_max
    from public.meals m
    left join public.profiles p on p.id = m.user_id
    where m.glucose_spike is null
      and m.eaten_at <= now() - interval '2 hours'
      and m.eaten_at >= now() - interval '26 hours'
  ),
  baseline as (
    select c.id, c.meta_max,
           (select g.value_mg_dl from public.glucose_readings g
            where g.user_id = c.user_id
              and g.recorded_at <= c.eaten_at
              and g.recorded_at >= c.eaten_at - interval '30 minutes'
              and g.source is distinct from 'mock'
            order by g.recorded_at desc limit 1) as before_value,
           (select max(g.value_mg_dl) from public.glucose_readings g
            where g.user_id = c.user_id
              and g.recorded_at > c.eaten_at
              and g.recorded_at <= c.eaten_at + interval '2 hours'
              and g.source is distinct from 'mock') as peak_value,
           (select count(*) from public.glucose_readings g
            where g.user_id = c.user_id
              and g.recorded_at > c.eaten_at
              and g.recorded_at <= c.eaten_at + interval '2 hours'
              and g.source is distinct from 'mock') as reading_count
    from candidates c
  )
  update public.meals m
  set glucose_spike = (
    b.peak_value is not null and (
      b.peak_value > b.meta_max
      or (b.before_value is not null and b.peak_value - b.before_value >= 50)
    )
  )
  from baseline b
  where m.id = b.id and b.reading_count > 0;
end;
$function$;

revoke execute on function public.evaluate_meal_glucose_spikes() from public, anon, authenticated;
