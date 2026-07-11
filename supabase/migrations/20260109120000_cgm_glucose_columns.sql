-- Camada CGM: deduplicação e metadados do sensor (Libre / Dexcom / mock)

alter table public.glucose_readings
  add column if not exists external_id text,
  add column if not exists trend text,
  add column if not exists metadata jsonb;

comment on column public.glucose_readings.external_id is 'ID estável do fabricante para evitar duplicar o mesmo ponto ao ressincronizar';
comment on column public.glucose_readings.trend is 'Seta ou ritmo ex.: Flat, FortyFiveUp (opcional)';
comment on column public.glucose_readings.metadata is 'Payload bruto ou campos extras do vendor';

-- Dedup quando external_id existe (parcial)
create unique index if not exists glucose_readings_user_source_external_uidx
  on public.glucose_readings (user_id, source, external_id)
  where external_id is not null;
