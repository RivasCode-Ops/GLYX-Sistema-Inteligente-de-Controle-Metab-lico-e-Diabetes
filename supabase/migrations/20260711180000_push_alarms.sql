-- Sistema de alarmes: assinaturas Web Push, horários de medicação e
-- registro de envios (evita alarme duplicado no mesmo horário/dia).

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user_idx
  on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

create policy "push_subscriptions_own"
  on public.push_subscriptions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Horários estruturados de lembrete por medicamento (HH:MM, fuso do perfil)
alter table public.medications
  add column if not exists reminder_times text[];

comment on column public.medications.reminder_times is 'Horários HH:MM no fuso do perfil para alarme de dose; null/vazio = sem alarme';

-- Log de despachos para dedupe (um alarme por medicamento/horário/dia)
create table if not exists public.push_dispatch_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null,
  ref text not null,
  sent_on date not null,
  created_at timestamptz not null default now(),
  unique (user_id, kind, ref, sent_on)
);

alter table public.push_dispatch_log enable row level security;

create policy "push_dispatch_log_own"
  on public.push_dispatch_log for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
