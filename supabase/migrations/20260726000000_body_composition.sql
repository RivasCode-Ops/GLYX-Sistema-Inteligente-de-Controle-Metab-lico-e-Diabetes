-- Composição corporal: medidas, dobras cutâneas, fotos de progresso e metas.
--
-- Por que tabela nova e não colunas em weight_logs: peso é pesagem frequente
-- (semanal/diária) e já alimenta o ajuste calórico; medida de fita é mensal e
-- tem 15 campos opcionais. Misturar faria a maioria das linhas de peso carregar
-- 20 colunas nulas e quebraria a média móvel de peso, que espera 1 valor/dia.

create table if not exists public.body_measurements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  measured_on date not null default current_date,

  -- Peso repetido aqui de propósito: a medição de fita costuma ser feita na
  -- mesma hora da pesagem, e a análise de composição precisa do par
  -- peso+medida do MESMO dia. Quando nulo, o cálculo cai para weight_logs.
  weight_kg numeric(5, 2) check (weight_kg is null or (weight_kg > 20 and weight_kg < 400)),

  -- Circunferências (cm). Faixa ampla de sanidade: recusa digitação em metros
  -- (0,91) ou milímetros (910), sem opinar sobre o corpo de ninguém.
  waist_cm numeric(5, 1) check (waist_cm is null or (waist_cm between 30 and 250)),
  abdomen_cm numeric(5, 1) check (abdomen_cm is null or (abdomen_cm between 30 and 250)),
  hip_cm numeric(5, 1) check (hip_cm is null or (hip_cm between 30 and 250)),
  chest_cm numeric(5, 1) check (chest_cm is null or (chest_cm between 30 and 250)),
  shoulders_cm numeric(5, 1) check (shoulders_cm is null or (shoulders_cm between 50 and 250)),
  neck_cm numeric(5, 1) check (neck_cm is null or (neck_cm between 20 and 100)),
  arm_right_relaxed_cm numeric(4, 1) check (arm_right_relaxed_cm is null or (arm_right_relaxed_cm between 15 and 90)),
  arm_left_relaxed_cm numeric(4, 1) check (arm_left_relaxed_cm is null or (arm_left_relaxed_cm between 15 and 90)),
  arm_right_flexed_cm numeric(4, 1) check (arm_right_flexed_cm is null or (arm_right_flexed_cm between 15 and 90)),
  arm_left_flexed_cm numeric(4, 1) check (arm_left_flexed_cm is null or (arm_left_flexed_cm between 15 and 90)),
  forearm_cm numeric(4, 1) check (forearm_cm is null or (forearm_cm between 10 and 70)),
  thigh_right_cm numeric(4, 1) check (thigh_right_cm is null or (thigh_right_cm between 25 and 120)),
  thigh_left_cm numeric(4, 1) check (thigh_left_cm is null or (thigh_left_cm between 25 and 120)),
  calf_right_cm numeric(4, 1) check (calf_right_cm is null or (calf_right_cm between 15 and 80)),
  calf_left_cm numeric(4, 1) check (calf_left_cm is null or (calf_left_cm between 15 and 80)),

  -- Dobras cutâneas (mm) — opcionais, exigem adipômetro.
  skf_triceps_mm numeric(4, 1) check (skf_triceps_mm is null or (skf_triceps_mm between 1 and 80)),
  skf_suprailiac_mm numeric(4, 1) check (skf_suprailiac_mm is null or (skf_suprailiac_mm between 1 and 80)),
  skf_abdominal_mm numeric(4, 1) check (skf_abdominal_mm is null or (skf_abdominal_mm between 1 and 80)),
  skf_chest_mm numeric(4, 1) check (skf_chest_mm is null or (skf_chest_mm between 1 and 80)),
  skf_thigh_mm numeric(4, 1) check (skf_thigh_mm is null or (skf_thigh_mm between 1 and 80)),

  notes text,
  created_at timestamptz not null default now(),

  -- Uma medição por dia: remedir o braço 3x na mesma tarde não é evolução, é
  -- ruído de medição. A mais recente do dia substitui (upsert).
  unique (user_id, measured_on)
);

comment on table public.body_measurements is
  'Medidas corporais (circunferências e dobras) por data. Composição estimada é derivada em TypeScript (lib/body), nunca gravada — fórmula pode mudar e o dado bruto é a fonte da verdade.';

create index if not exists body_measurements_user_date_idx
  on public.body_measurements (user_id, measured_on desc);

alter table public.body_measurements enable row level security;

create policy "body_measurements_own"
  on public.body_measurements for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Metas por medida. Uma linha por métrica para permitir meta parcial (só
-- braço e cintura, por exemplo) sem inventar valor para as outras.
create table if not exists public.body_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  metric text not null,
  target_value numeric(6, 2) not null check (target_value > 0),
  -- Valor de partida congelado na criação da meta: sem ele, "progresso" mudaria
  -- de significado a cada nova medição (a régua andaria junto com o resultado).
  start_value numeric(6, 2),
  start_on date not null default current_date,
  target_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, metric)
);

comment on table public.body_goals is
  'Meta por métrica de composição corporal (peso, cintura, braço…). start_value congela a régua do progresso.';

alter table public.body_goals enable row level security;

create policy "body_goals_own"
  on public.body_goals for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Fotos de progresso: 4 poses, bucket privado, mesmo padrão de meal-photos.
create table if not exists public.body_photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  taken_on date not null default current_date,
  pose text not null check (pose in ('frente', 'costas', 'perfil_esq', 'perfil_dir')),
  photo_path text not null,
  created_at timestamptz not null default now(),
  unique (user_id, taken_on, pose)
);

comment on table public.body_photos is
  'Foto de progresso por pose e data (bucket privado body-photos). Comparação é feita sob demanda, nunca automaticamente — foto de corpo é o dado mais sensível do app.';

create index if not exists body_photos_user_date_idx
  on public.body_photos (user_id, taken_on desc);

alter table public.body_photos enable row level security;

create policy "body_photos_own"
  on public.body_photos for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('body-photos', 'body-photos', false, 8388608, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "body_photos_select_own"
  on storage.objects for select
  using (bucket_id = 'body-photos' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "body_photos_insert_own"
  on storage.objects for insert
  with check (bucket_id = 'body-photos' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "body_photos_delete_own"
  on storage.objects for delete
  using (bucket_id = 'body-photos' and auth.uid()::text = (storage.foldername(name))[1]);
