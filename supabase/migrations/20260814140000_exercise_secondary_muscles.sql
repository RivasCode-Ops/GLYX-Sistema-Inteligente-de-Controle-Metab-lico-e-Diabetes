-- Vetor de ativação: músculo secundário — Fatia 5 do módulo Treino.
--
-- O catálogo guardava só o primário. Isso basta para dizer qual grupo foi
-- treinado (Fatias 2 e 3), e não basta para dizer quanto cada grupo trabalhou:
-- supino conta inteiro para peito e zero para tríceps e ombros, embora os
-- recrute nas mesmas séries.
--
-- ---------------------------------------------------------------------------
-- Por que isto NÃO entra na conta de volume comparada com a meta
-- ---------------------------------------------------------------------------
-- `WEEKLY_SET_TARGET` já embute o trabalho indireto: a própria definição diz
-- que "grupos pequenos recebem menos porque também são recrutados indiretamente
-- nos compostos". Somar série secundária ao mesmo contador compararia um número
-- inflado contra um alvo calibrado para trabalho direto, e o resultado seria um
-- volume plausível e errado — a falha que o §4.10 do CONTEXTO_TECNICO previu
-- por escrito para exatamente este momento.
--
-- Por isso a série secundária vira uma quantidade SEPARADA e rotulada. Nenhum
-- número existente muda de valor com esta migration.
--
-- ---------------------------------------------------------------------------
-- De onde vem a atribuição
-- ---------------------------------------------------------------------------
-- Padrão de movimento, não opinião: empurrar horizontal recruta tríceps e
-- ombro; puxar recruta bíceps e, quando há retração escapular, trapézio;
-- agachar recruta glúteo e posterior; dobradiça de quadril recruta lombar e
-- glúteo. Exercício isolador entra com vetor VAZIO, e isso é informação: rosca
-- direta não tem secundário relevante, e um array vazio diz isso melhor que uma
-- coluna nula, que se confundiria com "ainda não classificado".

alter table public.exercises
  add column if not exists secondary_muscles text[] not null default '{}';

comment on column public.exercises.secondary_muscles is
  'Músculos recrutados de forma secundária. NÃO entra em direct_sets nem na comparação com WEEKLY_SET_TARGET, que já embute trabalho indireto — alimenta uma contagem separada e rotulada. Array vazio = isolador sem secundário relevante, não "por classificar".';

-- Peito: empurrar horizontal/inclinado — tríceps e deltoide anterior.
update public.exercises set secondary_muscles = '{triceps,ombros}' where slug in
  ('supino-reto-barra', 'supino-reto-halteres', 'supino-inclinado-barra', 'supino-inclinado-halteres');
-- Crucifixo é adução com cotovelo fixo: ombro entra, tríceps não.
update public.exercises set secondary_muscles = '{ombros}' where slug = 'crucifixo-inclinado';

-- Costas: puxar recruta bíceps; remada com retração recruta trapézio.
update public.exercises set secondary_muscles = '{biceps,trapezio}' where slug in
  ('remada-baixa', 'remada-curvada-barra', 'remada-curvada-halter', 'remada-unilateral-halter');
update public.exercises set secondary_muscles = '{biceps}' where slug in
  ('barra-fixa-puxada-frente', 'puxada-alta-pegada-aberta', 'pulldown-polia-pegada-neutra');
-- Hiperextensão é dobradiça de quadril com lombar: glúteo e posterior entram.
update public.exercises set secondary_muscles = '{gluteos,posterior}' where slug = 'hiperextensao-lombar';

-- Ombros: desenvolvimento empurra acima da cabeça — tríceps e trapézio.
update public.exercises set secondary_muscles = '{triceps,trapezio}' where slug in
  ('desenvolvimento-halteres', 'desenvolvimento-militar');
-- Elevação lateral e face pull/crucifixo inverso: trapézio na retração, sem tríceps.
update public.exercises set secondary_muscles = '{trapezio}' where slug in
  ('elevacao-lateral', 'face-pull', 'crucifixo-inverso-peck-deck');

-- Pernas: agachar recruta glúteo e posterior.
update public.exercises set secondary_muscles = '{gluteos,posterior}' where slug in
  ('agachamento-livre', 'agachamento-frontal');
update public.exercises set secondary_muscles = '{gluteos}' where slug = 'leg-press-45';
-- Dobradiça de quadril: glúteo forte, lombar (costas) como estabilizador sob carga.
update public.exercises set secondary_muscles = '{gluteos,costas}' where slug in
  ('stiff', 'levantamento-terra-romeno');
update public.exercises set secondary_muscles = '{posterior}' where slug = 'elevacao-pelvica';

-- Isoladores ficam com o array vazio do default: cadeira extensora, mesa
-- flexora, panturrilhas, roscas, tríceps, encolhimento e o core. Não é omissão
-- — é o que "isolador" significa.

-- Rollback:
--   alter table public.exercises drop column if exists secondary_muscles;
