-- Contagem de tokens por chamada de IA — controle de gastos por usuário
alter table public.ai_usage
  add column if not exists prompt_tokens int,
  add column if not exists completion_tokens int,
  add column if not exists model text;

comment on column public.ai_usage.prompt_tokens is 'Tokens de entrada reportados pelo provedor';
comment on column public.ai_usage.completion_tokens is 'Tokens de saída reportados pelo provedor';
