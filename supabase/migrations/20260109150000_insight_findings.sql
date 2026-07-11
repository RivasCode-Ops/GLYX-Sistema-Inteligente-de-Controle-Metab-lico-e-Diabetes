-- Resultados do motor de correlação (v2) — um registo por utilizador e slug (upsert)

create table if not exists public.insight_findings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  slug text not null,
  title text not null,
  body text not null,
  severity text not null default 'info' check (severity in ('info', 'warning', 'critical')),
  metrics jsonb,
  computed_at timestamptz not null default now(),
  unique (user_id, slug)
);

create index if not exists insight_findings_user_computed_idx
  on public.insight_findings (user_id, computed_at desc);

comment on table public.insight_findings is 'Insights estatísticos (v2) — substituídos ao recalcular o mesmo slug';

alter table public.insight_findings enable row level security;

create policy "insight_findings_own"
  on public.insight_findings for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
