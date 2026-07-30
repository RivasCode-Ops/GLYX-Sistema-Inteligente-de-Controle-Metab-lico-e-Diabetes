-- Catálogo de exercícios — Fatia 1 do módulo Treino.
--
-- Hoje `strength_logs.exercise_name` é texto livre e `strength_logs.muscle_group`
-- é preenchido à mão. Isso significa que "Supino Reto", "supino reto" e "Supino
-- reto c/ barra" são três exercícios distintos para qualquer agregação, e que a
-- atribuição muscular depende de quem digitou. O catálogo é a fonte de verdade
-- que resolve os dois.
--
-- ESTA MIGRATION É PURAMENTE ADITIVA. Ela cria e popula uma tabela nova e não
-- toca em nada existente: nem em `strength_logs`, nem em `MuscleGroupId`,
-- `WEEKLY_SET_TARGET`, `MUSCLE_SPLITS` ou `WEEKDAY_PLAN`. Nenhum número exibido
-- hoje muda. A migração dos consumidores é fatia própria.
--
-- ---------------------------------------------------------------------------
-- Vocabulário muscular do catálogo
-- ---------------------------------------------------------------------------
-- O catálogo tem vocabulário PRÓPRIO, com 12 valores, deliberadamente mais rico
-- que os 10 de `MuscleGroupId`. Os dois extras são `trapezio` e `gluteos`:
--
--   - trapezio: hoje o encolhimento é contado como costas, o que infla costas e
--     esconde o trapézio.
--   - gluteos: é o primário da elevação pélvica e forte em agachamento, terra e
--     stiff — não existia como valor em lugar nenhum.
--
-- Ter vocabulário próprio é a razão de a fatia conseguir ser aditiva: o catálogo
-- nasce correto em vez de nascer torto para caber no modelo de 10 ids.
--
-- ---------------------------------------------------------------------------
-- Histórico: sem backfill, por decisão
-- ---------------------------------------------------------------------------
-- Nada em `strength_logs` é reetiquetado. Reclassificar texto livre para um id
-- de catálogo é chute apresentado como dado — e o dado errado seria indistinguível
-- do certo depois de gravado.
--
-- DATA DE CORTE: 2026-07-30. Registros anteriores a esta data seguem com
-- atribuição muscular manual; a série tem descontinuidade aqui, de propósito.
-- Depois que os consumidores migrarem, `strength_logs.muscle_group` passa a ser
-- derivável do exercício e tende a virar redundante.

create table if not exists public.exercises (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  -- Cardio tem mecânica diferente e NÃO entra no motor de fadiga muscular nem
  -- no vetor de ativação. A coluna é o que permite o motor ignorá-lo sem
  -- precisar de uma tabela separada.
  mechanic text not null check (mechanic in ('resistencia', 'cardio')),
  primary_muscle text check (primary_muscle in (
    'peito', 'costas', 'trapezio', 'ombros', 'biceps', 'triceps',
    'antebracos', 'quadriceps', 'posterior', 'gluteos', 'panturrilhas', 'abdomen'
  )),
  -- Categoria como veio do infográfico de origem, preservada mesmo quando
  -- diverge do primário (elevação pélvica vem em "Pernas" e é de glúteos).
  -- Guardar as duas deixa a correção auditável em vez de invisível.
  source_category text not null,
  created_at timestamptz not null default now(),
  -- Exercício de resistência sempre tem primário; cardio nunca tem. Sem isto,
  -- um exercício de resistência poderia entrar sem músculo e sumir de toda
  -- agregação por músculo — falha silenciosa, o modo que este módulo evita.
  constraint exercises_muscle_matches_mechanic check (
    (mechanic = 'resistencia' and primary_muscle is not null) or
    (mechanic = 'cardio' and primary_muscle is null)
  )
);

comment on table public.exercises is
  'Catálogo de exercícios (fonte de verdade). Vocabulário muscular próprio, mais rico que MuscleGroupId — ver 20260730140000.';

create index if not exists exercises_primary_muscle_idx
  on public.exercises (primary_muscle);

-- Referência global, não dado de usuário: leitura para qualquer autenticado,
-- escrita só por service role (ausência de policy de write já basta). Por não
-- ter user_id, fica fora do export e do wipe de LGPD — não há o que exportar.
alter table public.exercises enable row level security;

create policy "exercises_read_authenticated"
  on public.exercises for select
  to authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- Seed — 40 de resistência + 2 de cardio
-- ---------------------------------------------------------------------------
-- Deduplicado da grade de 30 do infográfico, que tinha repetições. Variações do
-- mesmo padrão (supino inclinado com barra vs. com halteres) são registros
-- SEPARADOS: o vetor de ativação e a curva de resistência diferem, então uni-los
-- sob uma flag de equipamento perderia justamente o que a Fatia 2 vai medir.
--
-- Não há coluna de equipamento: a origem só distingue equipamento dentro do
-- nome, e preencher os ~30 restantes por inferência seria inventar dado.

insert into public.exercises (slug, name, mechanic, primary_muscle, source_category) values
  ('supino-reto-barra',            'Supino Reto (barra)',                        'resistencia', 'peito',        'Peito'),
  ('supino-reto-halteres',         'Supino Reto (halteres)',                     'resistencia', 'peito',        'Peito'),
  ('supino-inclinado-barra',       'Supino Inclinado (barra)',                   'resistencia', 'peito',        'Peito'),
  ('supino-inclinado-halteres',    'Supino Inclinado (halteres)',                'resistencia', 'peito',        'Peito'),
  ('crucifixo-inclinado',          'Crucifixo Inclinado',                        'resistencia', 'peito',        'Peito'),

  ('barra-fixa-puxada-frente',     'Barra Fixa / Puxada na Frente (pegada aberta)', 'resistencia', 'costas',    'Costas'),
  ('puxada-alta-pegada-aberta',    'Puxada Alta (pegada aberta)',                'resistencia', 'costas',       'Costas'),
  ('pulldown-polia-pegada-neutra', 'Pulldown na Polia (pegada neutra)',          'resistencia', 'costas',       'Costas'),
  ('remada-curvada-barra',         'Remada Curvada com Barra',                   'resistencia', 'costas',       'Costas'),
  ('remada-curvada-halter',        'Remada Curvada com Halter',                  'resistencia', 'costas',       'Costas'),
  ('remada-unilateral-halter',     'Remada Unilateral com Halter',               'resistencia', 'costas',       'Costas'),
  ('remada-baixa',                 'Remada Baixa',                               'resistencia', 'costas',       'Costas'),
  ('hiperextensao-lombar',         'Hiperextensão Lombar',                       'resistencia', 'costas',       'Costas'),

  ('desenvolvimento-militar',      'Desenvolvimento Militar',                    'resistencia', 'ombros',       'Ombros'),
  ('desenvolvimento-halteres',     'Desenvolvimento com Halteres',               'resistencia', 'ombros',       'Ombros'),
  ('elevacao-lateral',             'Elevação Lateral',                           'resistencia', 'ombros',       'Ombros'),
  ('crucifixo-inverso-peck-deck',  'Crucifixo Inverso no Peck Deck',             'resistencia', 'ombros',       'Ombros'),
  ('face-pull',                    'Face Pull',                                  'resistencia', 'ombros',       'Ombros'),

  -- Único exercício cujo primário só existe graças ao vocabulário novo.
  ('encolhimento',                 'Encolhimento (barra ou halteres)',           'resistencia', 'trapezio',     'Trapézio'),

  ('rosca-direta-barra',           'Rosca Direta com Barra',                     'resistencia', 'biceps',       'Bíceps / antebraço'),
  ('rosca-alternada-halteres',     'Rosca Alternada com Halteres',               'resistencia', 'biceps',       'Bíceps / antebraço'),
  ('rosca-martelo',                'Rosca Martelo',                              'resistencia', 'biceps',       'Bíceps / antebraço'),
  -- Rosca inversa e de punho vêm na seção de bíceps mas são de antebraço.
  ('rosca-inversa',                'Rosca Inversa',                              'resistencia', 'antebracos',   'Bíceps / antebraço'),
  ('rosca-punho',                  'Rosca de Punho',                             'resistencia', 'antebracos',   'Bíceps / antebraço'),

  ('triceps-polia-corda',          'Tríceps na Polia (corda)',                   'resistencia', 'triceps',      'Tríceps'),
  ('triceps-frances-halter',       'Tríceps Francês (halter)',                   'resistencia', 'triceps',      'Tríceps'),

  ('agachamento-livre',            'Agachamento Livre',                          'resistencia', 'quadriceps',   'Pernas'),
  ('agachamento-frontal',          'Agachamento Frontal',                        'resistencia', 'quadriceps',   'Pernas'),
  ('leg-press-45',                 'Leg Press 45°',                              'resistencia', 'quadriceps',   'Pernas'),
  ('cadeira-extensora',            'Cadeira Extensora',                          'resistencia', 'quadriceps',   'Pernas'),
  ('mesa-flexora',                 'Mesa Flexora',                               'resistencia', 'posterior',    'Pernas'),
  ('stiff',                        'Stiff',                                      'resistencia', 'posterior',    'Pernas'),
  ('levantamento-terra-romeno',    'Levantamento Terra Romeno',                  'resistencia', 'posterior',    'Pernas'),
  -- Vem em "Pernas" na origem, mas o primário é glúteo — a correção que o
  -- vocabulário novo permite registrar em vez de aproximar.
  ('elevacao-pelvica',             'Elevação Pélvica',                           'resistencia', 'gluteos',      'Pernas'),
  ('panturrilha-em-pe',            'Panturrilha em Pé',                          'resistencia', 'panturrilhas', 'Pernas'),
  ('panturrilha-sentado',          'Panturrilha Sentado',                        'resistencia', 'panturrilhas', 'Pernas'),

  ('abdominal-maquina',            'Abdominal Máquina',                          'resistencia', 'abdomen',      'Core'),
  ('elevacao-de-pernas',           'Elevação de Pernas',                         'resistencia', 'abdomen',      'Core'),
  ('prancha-abdominal',            'Prancha Abdominal',                          'resistencia', 'abdomen',      'Core'),
  ('abdominal-obliquo-bicicleta',  'Abdominal Oblíquo (bicicleta)',              'resistencia', 'abdomen',      'Core'),

  ('esteira',                      'Esteira',                                    'cardio',      null,           'Cardio'),
  ('bicicleta-ergometrica',        'Bicicleta Ergométrica',                      'cardio',      null,           'Cardio')
on conflict (slug) do nothing;
