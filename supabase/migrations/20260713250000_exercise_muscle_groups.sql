-- Grupos musculares trabalhados numa sessao, para o painel de recuperacao
-- muscular. Reaproveita exercise_sessions em vez de criar tabela paralela.
alter table public.exercise_sessions
  add column if not exists muscle_groups text[];
