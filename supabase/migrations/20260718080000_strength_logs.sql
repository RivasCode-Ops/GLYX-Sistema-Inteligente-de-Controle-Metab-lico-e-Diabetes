-- Progressão de carga por exercício (peso x repetições x séries) — falta
-- hoje: exercise_sessions só registra "treinei peito X min", sem detalhe de
-- carga, então não dá pra comparar com a última vez no mesmo exercício.

create table if not exists public.strength_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  exercise_name text not null,
  muscle_group text,
  weight_kg numeric(6, 2) check (weight_kg is null or weight_kg >= 0),
  reps int not null check (reps > 0 and reps <= 100),
  sets int not null default 1 check (sets > 0 and sets <= 20),
  logged_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

comment on table public.strength_logs is
  'Registro de carga por exercício (peso/reps/séries) para acompanhar progressão — separado de exercise_sessions, que é o registro geral da sessão.';

create index if not exists strength_logs_user_exercise_idx
  on public.strength_logs (user_id, exercise_name, logged_at desc);

alter table public.strength_logs enable row level security;

create policy "strength_logs_own"
  on public.strength_logs for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
