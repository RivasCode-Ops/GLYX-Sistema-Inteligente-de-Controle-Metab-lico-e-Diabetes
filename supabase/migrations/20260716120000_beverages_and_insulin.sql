-- Bebidas além de água (café, água com gás, refrigerante diet etc.) e
-- registro de insulina extra (dose de correção quando a glicemia está alta).
-- O app REGISTRA a dose que o usuário aplicou por orientação médica — nunca
-- recomenda quantidade.

alter table public.water_logs
  add column if not exists kind text not null default 'agua'
    check (kind in ('agua', 'agua_com_gas', 'cha', 'cafe', 'refrigerante_diet', 'outra'));

comment on column public.water_logs.kind is
  'Tipo de bebida; agua/agua_com_gas/cha contam para a meta de hidratação.';

create table if not exists public.insulin_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  units numeric(5, 1) not null check (units > 0 and units <= 100),
  insulin_kind text not null default 'rapida'
    check (insulin_kind in ('rapida', 'basal', 'outra')),
  reason text not null default 'correcao'
    check (reason in ('correcao', 'refeicao', 'outra')),
  glucose_mg_dl int
    check (glucose_mg_dl is null or (glucose_mg_dl >= 20 and glucose_mg_dl <= 600)),
  notes text,
  applied_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

comment on table public.insulin_logs is
  'Doses extras/correção que o usuário aplicou — registro para análise, não recomendação.';

create index if not exists insulin_logs_user_applied_idx
  on public.insulin_logs (user_id, applied_at desc);

alter table public.insulin_logs enable row level security;

create policy "insulin_logs_own"
  on public.insulin_logs for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
