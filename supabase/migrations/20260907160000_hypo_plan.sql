-- Plano de hipoglicemia — a conduta é DO USUÁRIO, definida com o médico dele.
--
-- O app não popula nada por padrão e não tem número clínico embutido em lugar
-- nenhum: `correction_text`, `recheck_minutes` e `threshold_mg_dl` vêm da
-- pessoa. Sem linha aqui, o card mostra "plano não configurado" e leva ao
-- cadastro — nunca inventa a conduta.
--
-- É a diferença entre RENDERIZAR o plano de alguém e PRESCREVER. O GLYX faz a
-- primeira coisa.

create table if not exists public.hypo_plan (
  user_id            uuid primary key references auth.users (id) on delete cascade,
  -- o que o usuário definiu com o médico, no texto livre dele
  correction_text    text not null,
  -- minutos até reavaliar, definido por ele
  recheck_minutes    integer not null check (recheck_minutes between 5 and 60),
  -- limiar em mg/dL abaixo do qual o card dispara.
  --
  -- SEM DEFAULT, de propósito. No cadastro o campo vem pré-preenchido com o
  -- limite inferior da faixa alvo que ele já configurou no app, e ele confirma
  -- ou altera. Um default aqui seria o app escolhendo o limiar de hipoglicemia
  -- de alguém — que é exatamente o que esta fatia não faz.
  threshold_mg_dl    integer not null check (threshold_mg_dl between 50 and 100),
  -- contato/orientação de emergência que ele mesmo escreveu
  emergency_text     text,
  updated_at         timestamptz not null default now()
);

alter table public.hypo_plan enable row level security;

-- Reexecutável de propósito: `create policy` e `add constraint` NÃO têm
-- `if not exists` no Postgres. Sem o `drop` antes, aplicar esta migration duas
-- vezes falha — e o retry é o caso COMUM, não o raro: aplicação manual pelo
-- painel, falha no meio de uma sequência de sete, ou rodar de novo por dúvida
-- sobre ter completado. Pior, falharia DEPOIS de já ter criado tabela e índice
-- (que são idempotentes), deixando o estado pela metade.
drop policy if exists "hypo_plan_own" on public.hypo_plan;
create policy "hypo_plan_own" on public.hypo_plan
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Execução do plano — fecha o ciclo do card
-- ---------------------------------------------------------------------------
-- Sem este registro o card de hipoglicemia não teria como saber que o usuário
-- já agiu, e voltaria a pedir a mesma coisa; e a reavaliação nunca seria
-- cobrada. `acted_at` e `recheck_at` nulos são estados legítimos do ciclo, não
-- dado faltando.
create table if not exists public.hypo_events (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  detected_at    timestamptz not null,
  glucose_mg_dl  integer not null,
  acted_at       timestamptz,
  recheck_at     timestamptz,
  recheck_mg_dl  integer,
  created_at     timestamptz not null default now()
);

alter table public.hypo_events enable row level security;

drop policy if exists "hypo_events_own" on public.hypo_events;
create policy "hypo_events_own" on public.hypo_events
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create index if not exists hypo_events_user_detected_idx
  on public.hypo_events (user_id, detected_at desc);

comment on column public.hypo_plan.threshold_mg_dl is
  'Limiar do usuário, confirmado por ele no cadastro a partir da faixa alvo já configurada. Nenhum valor clínico nasce do código.';
