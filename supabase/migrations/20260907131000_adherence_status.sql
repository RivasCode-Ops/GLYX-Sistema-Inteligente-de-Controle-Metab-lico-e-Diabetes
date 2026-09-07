-- Registro nunca recusado.
--
-- REGRA QUE ESTRUTURA ESTA MIGRATION: o app não recusa registro.
--
-- Recusar registro atrasado não melhora adesão — apaga o dado. O usuário toma o
-- item de qualquer forma, e o banco passa a AFIRMAR que ele não tomou. Esse
-- histórico falso alimenta o checador de interação (substance_interactions), o
-- contador de mecanismos e o relatório do médico. Registro atrasado é informação
-- correta; registro ausente é informação errada.
--
-- Por isso `adherence_status` é RÓTULO, derivado no insert. Nenhum valor dele
-- bloqueia gravação, e não há CHECK que relacione status com horário.

alter table public.medication_logs
  add column if not exists scheduled_for timestamptz;

alter table public.medication_logs
  add column if not exists adherence_status text
    check (adherence_status in ('no_horario','atrasado','fora_janela','avulso'));

-- A consulta que o card e o relatório fazem: doses do usuário, mais recentes
-- primeiro.
create index if not exists medication_logs_user_taken_idx
  on public.medication_logs (user_id, taken_at desc);

-- ---------------------------------------------------------------------------
-- Backfill — e a descontinuidade assumida
-- ---------------------------------------------------------------------------
-- DATA DE CORTE: 2026-09-07. Toda linha anterior recebe 'avulso' e
-- `scheduled_for` nulo.
--
-- Não se tenta reconstruir a adesão histórica. Para saber se uma dose de março
-- foi "no horário" seria preciso saber que horários estavam cadastrados naquele
-- dia — e `medications.reminder_times` guarda só o valor ATUAL, sem histórico.
-- Derivar a partir do horário de hoje produziria um número que parece medido e
-- é chute. A série tem descontinuidade aqui, de propósito; mesma decisão tomada
-- na migration do catálogo de exercícios (20260730140000).
update public.medication_logs
  set adherence_status = 'avulso'
  where adherence_status is null;

comment on column public.medication_logs.scheduled_for is
  'Qual horário previsto este registro cumpre. Nulo quando não há horário correspondente.';

comment on column public.medication_logs.adherence_status is
  'Rótulo derivado no insert, nunca porteiro. no_horario | atrasado (mesmo dia) | fora_janela (outro dia, ou item livre com horário) | avulso (item sem reminder_times, inclui todo item livre). Linhas anteriores a 2026-09-07 são todas avulso por decisão: a adesão histórica não é reconstruível.';
