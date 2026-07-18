-- Adiciona "recomp" (recomposição corporal: ganhar músculo + perder gordura,
-- peso total estável) como objetivo válido, ao lado de lose/gain/maintain.
alter table public.profiles
  drop constraint if exists profiles_body_goal_check;

alter table public.profiles
  add constraint profiles_body_goal_check
  check (body_goal = any (array['lose', 'gain', 'maintain', 'recomp']));
