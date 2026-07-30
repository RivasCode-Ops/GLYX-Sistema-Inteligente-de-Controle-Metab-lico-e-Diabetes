-- Ajusta `insight_findings.module` a duas decisões que a migration anterior
-- (20260730000000) errou por antecipação.
--
-- 1. O módulo seguinte é Treino, não composição corporal. O CHECK anterior
--    listava 'body', que era chute meu: nenhuma linha e nenhum código jamais
--    escreveram esse valor, então trocá-lo agora não custa nada. Quando
--    Composição precisar gravar aqui, é uma linha a mais neste CHECK.
--
-- 2. O default 'glucose' cai. Ele existia só para backfillar as linhas
--    anteriores à coluna e já cumpriu esse papel. Mantê-lo é um risco real:
--    um insert do motor de treino que esquecesse a coluna não falharia — o
--    banco carimbaria 'glucose' e o achado apareceria na aba de glicemia sem
--    erro nenhum. Sem default, o mesmo esquecimento vira violação de NOT NULL
--    na hora da escrita.
--
-- Seguro nas duas pontas: a tabela está vazia (0 linhas) e o único código que
-- escreve aqui já passa `module` explicitamente, por ser parâmetro obrigatório
-- em `persistFindings`.

begin;

alter table public.insight_findings
  alter column module drop default;

alter table public.insight_findings
  drop constraint if exists insight_findings_module_check;

alter table public.insight_findings
  add constraint insight_findings_module_check
  check (module in ('glucose', 'training'));

commit;

-- A unique (user_id, module, slug) e o índice (user_id, module, computed_at desc)
-- já vieram de 20260730000000 e seguem válidos — nada a fazer aqui.

-- ---------------------------------------------------------------------------
-- Rollback
-- ---------------------------------------------------------------------------
-- begin;
--   alter table public.insight_findings
--     drop constraint if exists insight_findings_module_check;
--   alter table public.insight_findings
--     add constraint insight_findings_module_check
--     check (module in ('glucose', 'body'));
--   alter table public.insight_findings
--     alter column module set default 'glucose';
-- commit;
--
-- Falha se já existirem linhas com module = 'training'. Nesse caso decida o
-- destino delas antes (apagar ou reclassificar) — não as apague no automático.
