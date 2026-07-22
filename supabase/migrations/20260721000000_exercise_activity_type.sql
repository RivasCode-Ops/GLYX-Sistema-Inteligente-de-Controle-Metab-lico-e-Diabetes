-- Tipo de atividade estruturado nas sessoes de exercicio. Antes, corrida e
-- bicicleta so existiam como texto livre em `label`, sem forma confiavel de
-- agregar cardio vs forca. Coluna nullable: sessoes antigas (e o registro
-- rapido do painel de recuperacao) continuam validas sem tipo definido.
alter table public.exercise_sessions
  add column if not exists activity_type text;

alter table public.exercise_sessions
  drop constraint if exists exercise_sessions_activity_type_check;
alter table public.exercise_sessions
  add constraint exercise_sessions_activity_type_check
  check (
    activity_type is null
    or activity_type in ('corrida', 'bicicleta', 'caminhada', 'forca', 'outro')
  );

-- Resumos semanais filtram sessoes da semana por usuario e agrupam por tipo.
create index if not exists exercise_sessions_user_type_idx
  on public.exercise_sessions (user_id, activity_type);
