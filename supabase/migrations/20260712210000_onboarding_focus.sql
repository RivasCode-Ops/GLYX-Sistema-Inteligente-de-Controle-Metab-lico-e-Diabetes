-- Onboarding: foco principal escolhido na primeira entrada; o app se
-- organiza por ele (painel, IA, treino). Contas existentes marcadas como
-- onboarding_done para não caírem no assistente.

alter table public.profiles
  add column if not exists primary_focus text check (primary_focus in ('diabetes','lose','gain')),
  add column if not exists onboarding_done boolean not null default false;

comment on column public.profiles.primary_focus is 'Foco escolhido no onboarding: diabetes = controle glicêmico, lose = emagrecer, gain = ganhar massa';

update public.profiles set onboarding_done = true;
