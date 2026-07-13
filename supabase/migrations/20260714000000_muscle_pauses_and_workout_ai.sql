-- Pausa manual de um grupo muscular ("por enquanto não consigo seguir o
-- plano nesse grupo" -- dor, falta de tempo, lesão leve, etc.). Diferente
-- da recuperacao por horas: fica pausado ate o usuario liberar, sem prazo
-- fixo, porque motivo real nao segue cronometro.
create table if not exists public.muscle_pauses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  muscle_group text not null,
  reason text,
  paused_at timestamptz not null default now(),
  resumed_at timestamptz
);

-- No maximo uma pausa ativa por grupo/usuario.
create unique index if not exists muscle_pauses_active_unique
  on public.muscle_pauses (user_id, muscle_group)
  where resumed_at is null;

create index if not exists muscle_pauses_user_idx
  on public.muscle_pauses (user_id, muscle_group);

alter table public.muscle_pauses enable row level security;

create policy "muscle_pauses_own"
  on public.muscle_pauses for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Sugestao de exercicios por par de musculos (IA), mesmo controle de uso
-- das demais rotas de IA.
alter table public.ai_usage drop constraint if exists ai_usage_kind_check;
alter table public.ai_usage add constraint ai_usage_kind_check
  check (kind in ('chat', 'meal_photo', 'exam', 'supplement', 'meal_suggest', 'workout_suggestion'));
