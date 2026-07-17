-- Snapshots longitudinais da auditoria metabólica / mapa de risco (append-only)

create table if not exists public.metabolic_audits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  window_days int not null check (window_days >= 7 and window_days <= 90),
  period_start date not null,
  period_end date not null,
  score int not null check (score >= 0 and score <= 100),
  label text not null check (label in ('Estável', 'Atenção', 'Alerta', 'Dados insuficientes')),
  metrics jsonb not null default '{}'::jsonb,
  factors jsonb not null default '[]'::jsonb,
  plan jsonb not null default '[]'::jsonb,
  computed_at timestamptz not null default now()
);

create index if not exists metabolic_audits_user_computed_idx
  on public.metabolic_audits (user_id, computed_at desc);

comment on table public.metabolic_audits is
  'Relatórios de mapa de risco / auditoria metabólica — históricos versionados (não upsert).';

alter table public.metabolic_audits enable row level security;

create policy "metabolic_audits_own"
  on public.metabolic_audits for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
