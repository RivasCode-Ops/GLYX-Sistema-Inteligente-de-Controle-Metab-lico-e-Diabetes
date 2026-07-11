-- Snapshots diários agregados (Apple Health, Google Fit, manual, mock)
-- Web não acede diretamente ao HealthKit; esta tabela recebe dados via API/app nativo futuro.

create table if not exists public.health_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  snapshot_date date not null,
  source text not null check (source in ('apple_health', 'google_fit', 'manual', 'mock')),
  steps int,
  sleep_hours numeric,
  resting_hr int,
  active_calories int,
  stress_score int,
  metadata jsonb,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, snapshot_date, source)
);

create index if not exists health_snapshots_user_day_idx
  on public.health_snapshots (user_id, snapshot_date desc);

comment on table public.health_snapshots is 'Agregados diários por fonte — dedup por (utilizador, dia, fonte)';

alter table public.health_snapshots enable row level security;

create policy "health_snapshots_own"
  on public.health_snapshots for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
