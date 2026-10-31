-- Etapa 2, B2: o episódio de hipoglicemia nasce quando a leitura cruza o
-- limiar do plano — não só quando a pessoa aperta "Fiz".
--
-- `hypo_events` existia com "Fiz" e reavaliação, mas nada o criava: nenhuma
-- leitura abria episódio, o card de reavaliação nunca aparecia e o relatório
-- não tinha o que contar. Agora, a cada leitura inserida:
--   * limiar = hypo_plan.threshold_mg_dl; sem plano, a meta mínima do perfil
--     (faixa incoerente cai em 70, espelho de resolveGlucoseTargets);
--   * só leitura recente (até 2 h): importação de histórico (CSV, sync atrasado)
--     não abre episódio de semanas atrás;
--   * demonstração (source = 'mock') não abre episódio (B12);
--   * um episódio por vez: se já há um aberto (sem reavaliação) detectado nas
--     últimas 6 h, a leitura nova não abre outro — é o mesmo episódio.
-- O app (markHypoActed) continua podendo abrir o episódio ao "Fiz" quando não
-- houver evento — este gatilho torna isso exceção, não regra.

create or replace function public.glyx_meta_minima(p_min integer, p_max integer)
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
      then p_min
    else 70
  end;
$$;

comment on function public.glyx_meta_minima(integer, integer) is
  'Meta mínima efetiva do perfil; faixa incoerente cai no padrão 70 (espelho de resolveGlucoseTargets).';

create or replace function public.abrir_evento_de_hipo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limiar integer;
begin
  if new.source is not distinct from 'mock'
     or new.recorded_at < now() - interval '2 hours'
     or new.recorded_at > now() + interval '5 minutes' then
    return null;
  end if;

  select coalesce(
           hp.threshold_mg_dl,
           public.glyx_meta_minima(p.target_glucose_min, p.target_glucose_max)
         )
    into v_limiar
    from public.profiles p
    left join public.hypo_plan hp on hp.user_id = p.id
   where p.id = new.user_id;

  if new.value_mg_dl >= coalesce(v_limiar, 70) then
    return null;
  end if;

  -- Serializa por usuário: duas leituras simultâneas (lote do sensor) não
  -- abrem dois episódios.
  perform pg_advisory_xact_lock(hashtextextended('hypo_events:' || new.user_id::text, 0));

  if exists (
    select 1 from public.hypo_events e
     where e.user_id = new.user_id
       and e.recheck_at is null
       and e.detected_at >= now() - interval '6 hours'
  ) then
    return null;
  end if;

  insert into public.hypo_events (user_id, detected_at, glucose_mg_dl)
  values (new.user_id, new.recorded_at, round(new.value_mg_dl)::integer);
  return null;
end;
$$;

revoke execute on function public.abrir_evento_de_hipo() from public, anon, authenticated;

drop trigger if exists glucose_readings_abrir_evento_de_hipo on public.glucose_readings;
create trigger glucose_readings_abrir_evento_de_hipo
  after insert on public.glucose_readings
  for each row execute function public.abrir_evento_de_hipo();
