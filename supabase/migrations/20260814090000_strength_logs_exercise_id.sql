-- A ponte entre o catálogo e o registro de carga — Fatia 2 do módulo Treino.
--
-- A Fatia 1 criou `public.exercises` (42 registros) e parou ali, de propósito:
-- o catálogo nasceu correto e desconectado, e ligar os consumidores era fatia
-- própria. Esta é a fatia. Hoje o catálogo não é lido por nada — `strength_logs`
-- continua guardando `exercise_name` como texto livre e `muscle_group` como
-- texto que o formulário nem chega a enviar (as 4 linhas existentes têm todas
-- `muscle_group` nulo, então registro de carga não contribui com nada para
-- nenhuma agregação por músculo).
--
-- `exercise_id` é o elo. Quando ele existe, nome e músculo deixam de ser
-- digitados e passam a ser derivados do catálogo no servidor.
--
-- ---------------------------------------------------------------------------
-- Por que a coluna é anulável
-- ---------------------------------------------------------------------------
-- Duas razões, e nenhuma é comodismo:
--
--   1. O histórico não é reetiquetado. Vale aqui a mesma decisão da Fatia 1:
--      adivinhar qual id de catálogo corresponde a um texto livre é chute
--      apresentado como dado, indistinguível do dado certo depois de gravado.
--      As linhas anteriores ficam com `exercise_id` nulo e é assim que se sabe,
--      olhando a linha, que a atribuição muscular dela é manual.
--
--   2. O texto livre continua válido. O catálogo tem 42 exercícios e a academia
--      tem mais; obrigar o usuário a escolher da lista transformaria "registrei
--      o que fiz" em "não deu para registrar". A escapatória é a razão de a
--      coluna não ser obrigatória.
--
-- `on delete set null`: se um exercício sair do catálogo, o registro de treino
-- do usuário sobrevive com o nome que tinha. O oposto — apagar em cascata o
-- histórico de carga de alguém porque o catálogo mudou — seria perda de dado do
-- usuário causada por manutenção de tabela de referência.

alter table public.strength_logs
  add column if not exists exercise_id uuid references public.exercises(id) on delete set null;

comment on column public.strength_logs.exercise_id is
  'Exercício do catálogo (public.exercises). Quando preenchido, exercise_name e muscle_group são derivados dele no servidor e não vêm do formulário. Nulo = registro por texto livre, com atribuição muscular manual — inclui tudo anterior a 2026-08-14, que não foi reetiquetado.';

-- Serve à pergunta que só passa a existir com a ponte: "como evoluiu a carga
-- NESTE exercício do catálogo", que hoje depende de casar texto.
create index if not exists strength_logs_user_exercise_id_idx
  on public.strength_logs (user_id, exercise_id, logged_at desc)
  where exercise_id is not null;

-- Rollback:
--   drop index if exists public.strength_logs_user_exercise_id_idx;
--   alter table public.strength_logs drop column if exists exercise_id;
