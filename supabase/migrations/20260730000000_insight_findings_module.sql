-- `insight_findings` passa a servir mais de um módulo (glicemia, composição, …).
--
-- Até aqui a tabela era genérica na estrutura mas glicémica no conteúdo: todo
-- slug vinha do motor de correlação v2. Isso escondia dois defeitos que só
-- apareceriam quando o segundo módulo escrevesse aqui:
--
--   1. `unique (user_id, slug)` é global. Dois módulos que escolhessem o mesmo
--      slug colidiriam, e como a escrita é `upsert`, um sobrescreveria o outro
--      **em silêncio** — sem erro, sem log, com o achado errado na tela.
--   2. A listagem filtra só por `user_id`. Achado de composição corporal
--      apareceria na aba Correlações da glicemia sem ninguém ter pedido.
--
-- O default 'glucose' não é chute: na data desta migration a tabela está vazia,
-- e qualquer linha anterior a ela viria necessariamente do motor glicémico.

alter table public.insight_findings
  add column if not exists module text not null default 'glucose';

comment on column public.insight_findings.module is
  'Módulo dono do achado. Novo valor exige migration (o CHECK é a rede que pega slug gravado no módulo errado).';

alter table public.insight_findings
  drop constraint if exists insight_findings_module_check;

alter table public.insight_findings
  add constraint insight_findings_module_check
  check (module in ('glucose', 'body'));

-- Expand antes de contract: a unicidade nova entra enquanto a antiga ainda
-- vale, para não existir janela sem constraint que sustente o ON CONFLICT.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.insight_findings'::regclass
      and conname = 'insight_findings_user_module_slug_key'
  ) then
    alter table public.insight_findings
      add constraint insight_findings_user_module_slug_key unique (user_id, module, slug);
  end if;
end $$;

alter table public.insight_findings
  drop constraint if exists insight_findings_user_id_slug_key;

-- Leitura real da aplicação: achados de UM módulo, mais recentes primeiro.
create index if not exists insight_findings_user_module_computed_idx
  on public.insight_findings (user_id, module, computed_at desc);

-- `insight_findings_user_computed_idx (user_id, computed_at desc)` fica de pé
-- de propósito: o índice novo não serve uma listagem cross-módulo, que é a
-- forma provável de um "todos os insights" no dashboard.
