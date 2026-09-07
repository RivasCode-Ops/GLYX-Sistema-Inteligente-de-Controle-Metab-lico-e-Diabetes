-- Mecanismos de ação e janelas aproximadas.
--
-- POR QUE EXISTE: o checador de interação (20260907120000) olha PARES. Cinco
-- substâncias que baixam glicose por cinco vias diferentes podem não gerar
-- nenhum par grave e ainda assim ser o problema. Contagem de mecanismos
-- distintos e sobreposição de horário são o que enxerga isso.
--
-- O que este módulo faz é CONTAR e localizar no tempo. Não estabelece causa, não
-- prevê glicemia, não recomenda suspender nada. A associação temporal é insumo
-- para a consulta médica, não parecer.
--
-- Tabela global: leitura para autenticado, sem policy de escrita. Curadoria por
-- migration, mesmo padrão de `exercises` e `substance_interactions`.

create table if not exists public.substance_mechanisms (
  id                       uuid primary key default gen_random_uuid(),
  canonical                text not null,
  -- Chave de DEDUPLICAÇÃO. Duas substâncias que baixam glicose pela mesma via
  -- contam UM mecanismo, não dois — senão o contador infla com sinônimos
  -- farmacológicos e o número perde sentido justamente onde ele importa.
  mechanism                text not null,
  -- Base do contador: só o que reduz glicemia soma.
  lowers_glucose           boolean not null default false,
  label                    text not null,
  -- Janela de ação aproximada, em horas, a partir da administração.
  --
  -- NÃO É PARÂMETRO CLÍNICO. Serve exclusivamente para calcular sobreposição de
  -- janelas, e não entra em nenhum cálculo de dose. A UI sempre exibe com o
  -- rótulo "janela aproximada", e o usuário sobrescreve em
  -- `user_substance_windows` conforme o médico dele.
  typical_duration_hours   numeric(4,1),
  duration_is_approximate  boolean not null default true,
  created_at               timestamptz not null default now(),
  -- Um slug pode ter mais de um mecanismo: associações como Glyxambi, e
  -- substâncias com efeito duplo como a berberina (sensibiliza E inibe CYP3A4).
  constraint substance_mechanisms_pair unique (canonical, mechanism)
);

create index if not exists substance_mechanisms_canonical_idx
  on public.substance_mechanisms (canonical);

alter table public.substance_mechanisms enable row level security;

create policy "substance_mechanisms_read" on public.substance_mechanisms
  for select to authenticated using (true);

-- ---------------------------------------------------------------------------
-- Override por usuário
-- ---------------------------------------------------------------------------
-- A curadoria acima é aproximação de referência. Esta tabela existe para que o
-- médico do usuário possa ajustar cada janela — e é dado do usuário, com RLS
-- própria, ao contrário da base curada.
create table if not exists public.user_substance_windows (
  user_id         uuid not null references auth.users (id) on delete cascade,
  canonical       text not null,
  duration_hours  numeric(4,1) not null check (duration_hours > 0 and duration_hours <= 48),
  updated_at      timestamptz not null default now(),
  primary key (user_id, canonical)
);

alter table public.user_substance_windows enable row level security;

create policy "user_substance_windows_own" on public.user_substance_windows
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Seed
-- ---------------------------------------------------------------------------
-- `sensibilizador_amp` é compartilhado por berberina, gymnema, cromo, ALA,
-- feno-grego, melão-de-são-caetano e canela. Dois deles juntos contam UM
-- mecanismo. É essa linha de curadoria que impede o contador de virar
-- contagem de vidros no armário.
insert into public.substance_mechanisms
  (canonical, mechanism, lowers_glucose, label, typical_duration_hours) values

  ('insulina_basal',    'insulina_exogena_basal',  true,
   'Insulina basal', 24.0),

  ('insulina_rapida',   'insulina_exogena_rapida', true,
   'Insulina rápida', 5.0),

  ('sulfonilureia',     'secretagogo',             true,
   'Secretagogo (estimula insulina própria)', 16.0),

  ('metformina',        'sensibilizador_amp',      true,
   'Sensibilizador à insulina', 12.0),

  ('inibidor_sglt2',    'glicosuria_renal',        true,
   'Excreção renal de glicose', 24.0),

  -- DPP-4 e GLP-1 são vias SEPARADAS, e não a mesma "via incretina".
  --
  -- O inibidor de DPP-4 prolonga a incretina que o próprio corpo produz; o
  -- agonista de GLP-1 é agonismo exógeno do receptor, independente da produção
  -- endógena. Compartilhar a chave `incretina` fazia a deduplicação tratar
  -- Januvia + Ozempic como UMA via — subcontagem, que num alerta de
  -- concentração de mecanismos é o erro que não dispara.
  --
  -- A deduplicação por mecanismo continua certa; o que estava errado era a
  -- chave. Ela vale para sinônimo farmacológico (os sete sensibilizadores),
  -- não para vias distintas com nome de família parecido.
  ('inibidor_dpp4',     'incretina_dpp4',          true,
   'Via incretina (DPP-4)', 24.0),

  ('agonista_glp1',     'incretina_glp1',          true,
   'Via incretina (GLP-1)', 168.0),

  ('berberina',         'sensibilizador_amp',      true,
   'Sensibilizador à insulina', 8.0),

  ('berberina',         'inibicao_cyp3a4_pgp',     false,
   'Inibe CYP3A4 e glicoproteína-P', 8.0),

  ('gymnema',           'sensibilizador_amp',      true,
   'Sensibilizador à insulina', 8.0),

  ('cromo_picolinato',  'sensibilizador_amp',      true,
   'Sensibilizador à insulina', 12.0),

  ('acido_alfa_lipoico','sensibilizador_amp',      true,
   'Sensibilizador à insulina', 8.0),

  ('feno_grego',        'sensibilizador_amp',      true,
   'Sensibilizador à insulina', 8.0),

  ('melao_sao_caetano', 'sensibilizador_amp',      true,
   'Sensibilizador à insulina', 8.0),

  ('canela_cassia',     'sensibilizador_amp',      true,
   'Sensibilizador à insulina', 8.0),

  ('hiperico',          'inducao_cyp3a4',          false,
   'Induz CYP3A4', 24.0),

  ('estatina',          'reducao_ldl',             false,
   'Redução de LDL', 24.0),

  ('anticoagulante',    'anticoagulacao',          false,
   'Anticoagulação', 24.0)
on conflict (canonical, mechanism) do nothing;
