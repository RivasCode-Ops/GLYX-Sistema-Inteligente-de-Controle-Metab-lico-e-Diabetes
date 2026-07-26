-- Novos tipos de uso de IA: relatório de composição corporal e comparação de
-- fotos de progresso. Kind próprio (em vez de reaproveitar 'chat') porque cada
-- um tem custo e limite horário diferentes — comparar duas fotos é visão
-- computacional, bem mais cara que texto.

alter table public.ai_usage drop constraint if exists ai_usage_kind_check;

alter table public.ai_usage add constraint ai_usage_kind_check
  check (kind in (
    'chat',
    'meal_photo',
    'meal_text',
    'exam',
    'supplement',
    'meal_suggest',
    'workout_suggestion',
    'medication_schedule',
    'body_composition',
    'body_photo'
  ));
