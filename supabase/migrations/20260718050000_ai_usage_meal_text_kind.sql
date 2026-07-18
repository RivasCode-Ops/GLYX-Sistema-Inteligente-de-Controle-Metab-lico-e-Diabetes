alter table public.ai_usage drop constraint if exists ai_usage_kind_check;
alter table public.ai_usage add constraint ai_usage_kind_check
  check (kind in ('chat', 'meal_photo', 'meal_text', 'exam', 'supplement', 'meal_suggest', 'workout_suggestion'));
