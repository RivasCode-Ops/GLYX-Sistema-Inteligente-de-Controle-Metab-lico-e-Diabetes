-- Parametros pessoais da calculadora de bolus de insulina, definidos com
-- o endocrinologista. Opcionais -- sem eles a calculadora nao aparece.
alter table public.profiles
  add column if not exists carb_ratio numeric,
  add column if not exists correction_factor numeric,
  add column if not exists target_glucose_bolus int;

-- Pressao arterial -- comorbidade comum com diabetes, ate entao sem
-- nenhum rastreio no app. Mesmo padrao de glucose_readings.
create table if not exists public.blood_pressure_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  systolic int not null check (systolic > 0 and systolic < 300),
  diastolic int not null check (diastolic > 0 and diastolic < 200),
  pulse int check (pulse is null or (pulse > 0 and pulse < 300)),
  recorded_at timestamptz not null default now(),
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists blood_pressure_logs_user_recorded_idx
  on public.blood_pressure_logs (user_id, recorded_at desc);

alter table public.blood_pressure_logs enable row level security;

create policy "blood_pressure_all_own" on public.blood_pressure_logs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
