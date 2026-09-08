-- De onde veio a duração da sessão de treino.
--
-- O PROBLEMA: 19 das 21 sessões estão sem `duration_min`, e a meta semanal é em
-- MINUTOS. O caminho que o usuário realmente usa — marcar os grupos treinados
-- em Recuperação — nunca pergunta quanto tempo durou. Resultado: "0 de 4
-- sessões · faltam 160 min" numa semana em que ele treinou. A meta é
-- inatingível por construção, e meta inatingível deixa de ser lida.
--
-- A saída é herdar a duração prevista do plano quando ela não foi informada.
-- Mas número herdado e número medido NÃO PODEM ser a mesma coisa no banco: sem
-- esta coluna, o app diria "320 min esta semana" sobre um total que ele mesmo
-- estimou, e ninguém depois teria como separar o que foi cronometrado do que
-- foi presumido.
--
-- Nula de propósito nas linhas antigas: não se pode afirmar retroativamente de
-- onde veio um número que já estava lá. Mesma decisão do backfill de adesão.
alter table public.exercise_sessions
  add column if not exists duration_source text
    check (duration_source is null or duration_source in ('informado', 'estimado'));

comment on column public.exercise_sessions.duration_source is
  'informado = o usuário digitou os minutos. estimado = herdado do plano de treino quando o caminho de registro não pergunta duração. Nulo = anterior a 08/09/2026, origem desconhecida.';
