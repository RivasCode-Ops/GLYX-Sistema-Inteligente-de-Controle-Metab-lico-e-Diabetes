-- Objetivo corporal (fase 1): dados físicos no perfil + registro de peso.
-- Alvos calóricos seguem ADA Standards of Care (déficit 500-750 kcal/dia,
-- perda 5-7%); cálculo no app (lib/health/energy.ts), não no banco.

alter table public.profiles
  add column if not exists sex text check (sex in ('m','f')),
  add column if not exists birth_year integer check (birth_year between 1900 and 2030),
  add column if not exists height_cm integer check (height_cm between 80 and 250),
  add column if not exists activity_level text check (activity_level in ('sedentary','light','moderate','very')),
  add column if not exists body_goal text check (body_goal in ('lose','gain','maintain')),
  add column if not exists target_weight_kg numeric check (target_weight_kg between 20 and 400),
  add column if not exists family_history text;

comment on column public.profiles.body_goal is 'lose = emagrecer, gain = ganhar massa muscular, maintain = manter/controle glicêmico';

create table if not exists public.weight_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  weight_kg numeric not null check (weight_kg > 20 and weight_kg < 400),
  logged_on date not null default current_date,
  created_at timestamptz not null default now(),
  unique (user_id, logged_on)
);

create index if not exists weight_logs_user_date_idx
  on public.weight_logs (user_id, logged_on desc);

alter table public.weight_logs enable row level security;

create policy "weight_logs_own"
  on public.weight_logs for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
