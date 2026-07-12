-- Suplementos (fase 2): mesma tabela/motor de medicamentos, com kind
-- diferenciando o tipo. Alarme de suplemento não é crítico (não exige
-- interação) e a reposição usa título de compra.
-- O corpo da função dispatch_med_alarms está na migração aplicada no
-- Supabase (13ª); diferenças: título por kind, critical só para 'med'.

alter table public.medications
  add column if not exists kind text not null default 'med' check (kind in ('med','supplement'));

comment on column public.medications.kind is 'med = medicamento, supplement = suplemento (whey, creatina...) — mesmo motor de alarmes/estoque';
