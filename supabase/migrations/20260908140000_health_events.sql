-- Marcador de evento — o que torna qualquer mudança avaliável.
--
-- POR QUE EXISTE: o usuário começou berberina em 18/07 e não havia onde
-- registrar isso. Sem a marca, nenhuma alteração de rotina — remédio novo, dose
-- trocada, suplemento iniciado, mudança de horário — tem um "antes" e um
-- "depois" que o app possa comparar. O histórico existe inteiro e não é
-- avaliável: um retrovisor sem régua.
--
-- É de propósito uma tabela de EVENTOS DECLARADOS pelo usuário, e não uma
-- derivação automática de `medications.created_at`. A data de cadastro é quando
-- ele registrou no app; a data do evento é quando aconteceu na vida, e as duas
-- divergem sempre que alguém cadastra o que já vinha tomando.
--
-- O app NÃO conclui efeito a partir daqui. Comparar antes e depois é descrição;
-- atribuir causa é conversa médica, e nenhuma coluna desta tabela guarda
-- veredito.

create table if not exists public.health_events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  -- Data do evento na vida, não do cadastro. `date` e não `timestamptz`: quem
  -- lembra que começou um suplemento "no dia 18" raramente lembra da hora, e
  -- pedir precisão que não existe produz hora inventada.
  occurred_on date not null,
  kind        text not null check (kind in (
                'medicacao_inicio', 'medicacao_fim', 'dose_alterada',
                'suplemento_inicio', 'suplemento_fim',
                'exame', 'consulta', 'rotina', 'outro'
              )),
  label       text not null,
  notes       text,
  -- Elo opcional com o item cadastrado. `on delete set null` porque apagar o
  -- medicamento não apaga o fato de ele ter sido iniciado: o evento continua
  -- explicando o que mudou naquela data.
  medication_id uuid references public.medications (id) on delete set null,
  created_at  timestamptz not null default now()
);

create index if not exists health_events_user_date_idx
  on public.health_events (user_id, occurred_on desc);

alter table public.health_events enable row level security;

-- Reexecutável: `create policy` não aceita `if not exists` no Postgres, e sem
-- o drop a segunda execução falha DEPOIS de criar tabela e índice.
drop policy if exists "health_events_own" on public.health_events;
create policy "health_events_own" on public.health_events
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

comment on table public.health_events is
  'Eventos declarados pelo usuário (início de medicação, troca de dose, exame, consulta). Servem de marco para comparação antes/depois. O app descreve a diferença entre os períodos; não atribui causa.';

comment on column public.health_events.occurred_on is
  'Data em que o evento aconteceu, informada pelo usuário — não a data de cadastro no app.';
