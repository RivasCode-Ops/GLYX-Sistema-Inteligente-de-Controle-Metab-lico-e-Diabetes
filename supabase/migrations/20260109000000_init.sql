-- GLYX schema — execute no SQL Editor do Supabase ou via CLI
-- Extensões
create extension if not exists "pgcrypto";

-- Perfis (1:1 com auth.users)
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  diabetes_type text,
  target_glucose_min int default 70,
  target_glucose_max int default 180,
  timezone text default 'America/Sao_Paulo',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Leituras glicêmicas
create table if not exists public.glucose_readings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  value_mg_dl int not null check (value_mg_dl > 0 and value_mg_dl < 1000),
  context text,
  source text not null default 'manual',
  recorded_at timestamptz not null default now(),
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists glucose_readings_user_recorded_idx
  on public.glucose_readings (user_id, recorded_at desc);

-- Refeições
create table if not exists public.meals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text,
  calories int,
  carbs_g numeric,
  protein_g numeric,
  fat_g numeric,
  glycemic_load_estimate numeric,
  notes text,
  eaten_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists meals_user_eaten_idx
  on public.meals (user_id, eaten_at desc);

-- Medicações agendadas
create table if not exists public.medications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  dosage text,
  schedule_hint text,
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.medication_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  medication_id uuid references public.medications (id) on delete set null,
  taken_at timestamptz not null default now(),
  confirmed boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists medication_logs_user_idx
  on public.medication_logs (user_id, taken_at desc);

-- Exercício
create table if not exists public.exercise_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  label text not null,
  duration_min int,
  calories_burned int,
  intensity text,
  started_at timestamptz not null default now(),
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists exercise_sessions_user_started_idx
  on public.exercise_sessions (user_id, started_at desc);

-- Alertas metabólicos
create table if not exists public.metabolic_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  severity text not null check (severity in ('info', 'warning', 'critical')),
  title text not null,
  body text,
  context jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists metabolic_alerts_user_created_idx
  on public.metabolic_alerts (user_id, created_at desc);

-- Exames / laudos
create table if not exists public.exams (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text,
  lab_name text,
  raw_text text,
  parsed_summary jsonb,
  created_at timestamptz not null default now()
);

-- IA — threads e mensagens
create table if not exists public.ai_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.ai_threads (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists ai_messages_thread_idx
  on public.ai_messages (thread_id, created_at);

-- Trigger perfil ao registrar usuário
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- RLS
alter table public.profiles enable row level security;
alter table public.glucose_readings enable row level security;
alter table public.meals enable row level security;
alter table public.medications enable row level security;
alter table public.medication_logs enable row level security;
alter table public.exercise_sessions enable row level security;
alter table public.metabolic_alerts enable row level security;
alter table public.exams enable row level security;
alter table public.ai_threads enable row level security;
alter table public.ai_messages enable row level security;

-- Policies profiles
create policy "profiles_select_own" on public.profiles for select using (auth.uid() = id);
create policy "profiles_update_own" on public.profiles for update using (auth.uid() = id);
create policy "profiles_insert_own" on public.profiles for insert with check (auth.uid() = id);

-- glucose_readings
create policy "glucose_all_own" on public.glucose_readings for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- meals
create policy "meals_all_own" on public.meals for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- medications
create policy "meds_all_own" on public.medications for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- medication_logs
create policy "med_logs_all_own" on public.medication_logs for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- exercise_sessions
create policy "exercise_all_own" on public.exercise_sessions for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- metabolic_alerts
create policy "alerts_all_own" on public.metabolic_alerts for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- exams
create policy "exams_all_own" on public.exams for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ai
create policy "ai_threads_own" on public.ai_threads for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "ai_messages_own" on public.ai_messages for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
