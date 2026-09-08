-- Invariantes do adiamento.
--
-- SINTOMA RELATADO: o adiar às vezes não é aceito, e o horário às vezes se
-- prorroga sozinho.
--
-- A hipótese registrada no briefing era que o job recalculava `snoozed_until` a
-- partir de `now()` a cada ciclo. MEDIDO NO CÓDIGO EM 07/09/2026: não é isso.
-- O dispatcher (20260718060000) só faz `set fired = true`; não há UPDATE em
-- `snoozed_until` em lugar nenhum, e a rota grava o valor uma vez no insert.
-- As invariantes 1 e 2 já valiam.
--
-- O que realmente produz o sintoma:
--
--   1. "Prorroga sozinho" — o push de adiamento passa pelo MESMO handler de
--      `public/sw.js`, e como carrega `medId` ele recebe de novo o botão
--      "⏰ Adiar 15min". A cadeia não tem fim: cada adiamento pode ser adiado.
--      Não há contador de tentativas, não há unique, e nada invalida o snooze
--      na virada do dia — um adiamento de 15 min criado às 23:55 toca às 00:10
--      do dia seguinte, quando o horário previsto já não existe mais.
--
--   2. "Não é aceito" — a rota exige sessão de cookie (`auth.getUser()`), e o
--      service worker dispara com o app fechado, quando a sessão pode estar
--      expirada. O SW já mostra "❌ Não consegui adiar (erro <status>)". É
--      falha de autenticação, não de gravação.
--
-- Esta migration cria as estruturas que TRAVAM o comportamento correto. A
-- correção do handler do SW e do limite de tentativas vive no código.

-- Qual horário previsto este adiamento está empurrando. É o que permite contar
-- tentativas POR DOSE em vez de por medicamento, e o que faz o adiamento morrer
-- com o dia: a dose de ontem não é a mesma dose de hoje.
alter table public.medication_snoozes
  add column if not exists scheduled_for timestamptz;

alter table public.medication_snoozes
  add column if not exists attempt integer;

-- ---------------------------------------------------------------------------
-- Backfill antes das constraints — e a razão de não usar `default now()`
-- ---------------------------------------------------------------------------
-- `add column scheduled_for timestamptz not null default now()` pareceria mais
-- simples e QUEBRARIA a migration: `now()` é estável dentro da transação, então
-- TODA linha existente receberia o mesmo timestamp. Com `attempt` também no
-- mesmo default, qualquer usuário que já adiou o mesmo remédio duas vezes
-- violaria o unique lá embaixo, e a migration falharia no meio.
--
-- `snoozed_until` é o valor honesto para as linhas antigas: é o único horário
-- que aquela linha de fato conhece.
update public.medication_snoozes
  set scheduled_for = snoozed_until
  where scheduled_for is null;

-- Tentativas em ordem, dentro de cada (usuário, remédio, horário). Empate exato
-- de `snoozed_until` é o único caso que geraria colisão, e o row_number resolve.
with numeradas as (
  select id,
         row_number() over (
           partition by user_id, medication_id, scheduled_for
           order by created_at, id
         ) as n
  from public.medication_snoozes
  where attempt is null
)
update public.medication_snoozes s
  set attempt = least(numeradas.n, 10)
  from numeradas
  where s.id = numeradas.id;

alter table public.medication_snoozes
  alter column scheduled_for set not null;

alter table public.medication_snoozes
  alter column attempt set not null;

alter table public.medication_snoozes
  alter column attempt set default 1;

-- Reexecutável de propósito: `create policy` e `add constraint` NÃO têm
-- `if not exists` no Postgres. Sem o `drop` antes, aplicar esta migration duas
-- vezes falha — e o retry é o caso COMUM, não o raro: aplicação manual pelo
-- painel, falha no meio de uma sequência de sete, ou rodar de novo por dúvida
-- sobre ter completado. Pior, falharia DEPOIS de já ter criado tabela e índice
-- (que são idempotentes), deixando o estado pela metade.
alter table public.medication_snoozes drop constraint if exists medication_snoozes_attempt_range;
alter table public.medication_snoozes
  add constraint medication_snoozes_attempt_range
    check (attempt between 1 and 10);

-- A trava que impede reescrita silenciosa: uma segunda gravação da MESMA
-- tentativa passa a falhar em vez de deslizar o horário. Adiar de novo cria
-- linha nova com `attempt` incrementado — nunca atualiza a anterior.
alter table public.medication_snoozes drop constraint if exists medication_snoozes_unique_attempt;
alter table public.medication_snoozes
  add constraint medication_snoozes_unique_attempt
    unique (user_id, medication_id, scheduled_for, attempt);

comment on column public.medication_snoozes.scheduled_for is
  'Horário previsto que este adiamento empurra. Conta tentativas por dose e faz o adiamento morrer com o dia.';

comment on column public.medication_snoozes.attempt is
  'Tentativa de adiamento desta dose. Limite de produto: 3. Atingido, o card troca as ações para Registrei / Pulei hoje e o adiar some.';
