-- Libera 'supplement' como tipo de uso de IA (analisador de rótulo de
-- suplemento cruzado com exames/medicações do usuário).

alter table public.ai_usage drop constraint if exists ai_usage_kind_check;
alter table public.ai_usage add constraint ai_usage_kind_check
  check (kind in ('chat', 'meal_photo', 'exam', 'supplement'));
