-- Sinal de acuracia da IA: verdadeiro quando o usuario ajustou algum valor
-- estimado (calorias/macros/impacto glicemico) antes de salvar a refeicao
-- analisada por foto. Base para futura melhoria de prompt/modelo.
alter table public.meals
  add column if not exists ai_corrected boolean not null default false;
