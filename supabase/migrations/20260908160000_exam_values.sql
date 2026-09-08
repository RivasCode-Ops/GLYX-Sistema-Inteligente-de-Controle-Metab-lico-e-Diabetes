-- Exame deixa de ser só documento e passa a ter VALOR ACOMPANHÁVEL.
--
-- ---------------------------------------------------------------------------
-- O QUE FALTAVA, medido em 08/09/2026
-- ---------------------------------------------------------------------------
-- Os três laudos do usuário estão no banco como `raw_text`: 2.100, 1.425 e
-- 1.585 caracteres de texto. `parsed_summary` nulo nos três. Dá para ARQUIVAR
-- exame; não dá para ACOMPANHAR exame. Sem isto não existe HbA1c de março ×
-- junho × setembro numa linha, LDL antes e depois do hipolipemiante novo, nem
-- creatinina acompanhada em quem usa SGLT2.
--
-- E faltava a peça mais simples: `exams` não tinha DATA DE COLETA. Só
-- `created_at`, que é quando se cadastrou. Os laudos são de 24/06 e 15/07 e o
-- banco os datava em 08/09 — com isso, qualquer série sai na ordem errada, e o
-- erro não se anuncia: a linha do tempo fica plausível e falsa.

alter table public.exams
  add column if not exists collected_on date;

comment on column public.exams.collected_on is
  'Data da COLETA, do laudo — não a do cadastro no app. Nula nos exames anteriores a 08/09/2026: a data existe no texto deles, e extrair por conta seria o app adivinhando o que deve perguntar.';

-- ---------------------------------------------------------------------------
-- Um valor por analito
-- ---------------------------------------------------------------------------
create table if not exists public.exam_values (
  id          uuid primary key default gen_random_uuid(),
  exam_id     uuid not null references public.exams (id) on delete cascade,
  -- `user_id` denormalizado de propósito: a RLS fica direta, sem subconsulta em
  -- `exams` a cada linha lida. A cascata do exame já garante que não sobra
  -- órfão.
  user_id     uuid not null references auth.users (id) on delete cascade,

  -- Slug canônico ('hba1c', 'ldl', 'creatinina'). É o que permite a SÉRIE:
  -- laboratórios diferentes escrevem o mesmo analito de formas diferentes, e
  -- agrupar pelo texto do laudo produziria uma série por grafia.
  analyte     text not null,
  -- Como veio escrito no laudo. Guardado junto porque o slug é interpretação, e
  -- quem confere precisa ver o original.
  label       text not null,

  value_num   numeric,
  -- Valor textual quando não é número: "<5", "ausente", "+". Um dos dois vem
  -- preenchido; nenhum resultado é descartado por não ser numérico.
  value_text  text,
  unit        text,

  ref_min     numeric,
  ref_max     numeric,
  -- Referência como impressa ("<70", "0,8-4,2", "negativo <10"). O laudo é a
  -- fonte, e reescrever a faixa em número perderia a que veio anotada à mão.
  ref_text    text,

  -- Data da coleta, repetida aqui para a série ser consultável sem join.
  collected_on date,
  created_at  timestamptz not null default now(),

  constraint exam_values_tem_valor check (value_num is not null or value_text is not null),
  -- Mesmo analito duas vezes no mesmo exame é erro de extração, não resultado.
  constraint exam_values_unico unique (exam_id, analyte)
);

create index if not exists exam_values_serie_idx
  on public.exam_values (user_id, analyte, collected_on desc);

alter table public.exam_values enable row level security;

drop policy if exists "exam_values_own" on public.exam_values;
create policy "exam_values_own" on public.exam_values
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

comment on table public.exam_values is
  'Um resultado por analito, extraído do laudo e CONFERIDO pelo usuário. O app transcreve e organiza; não classifica gravidade nem sugere conduta — as faixas exibidas são as impressas no próprio laudo.';
