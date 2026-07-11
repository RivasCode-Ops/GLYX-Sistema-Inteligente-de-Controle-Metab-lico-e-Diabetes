-- Registro de chamadas de IA por usuário — base do rate limiting
-- (protege os créditos do provedor contra abuso/loop)

create table if not exists public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('chat', 'meal_photo', 'exam')),
  created_at timestamptz not null default now()
);

create index if not exists ai_usage_user_kind_created_idx
  on public.ai_usage (user_id, kind, created_at desc);

comment on table public.ai_usage is 'Uma linha por chamada de IA — janela deslizante para rate limiting';

alter table public.ai_usage enable row level security;

create policy "ai_usage_own"
  on public.ai_usage for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
