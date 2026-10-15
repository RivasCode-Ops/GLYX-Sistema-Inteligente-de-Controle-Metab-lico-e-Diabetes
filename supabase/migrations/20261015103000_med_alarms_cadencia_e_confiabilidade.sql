-- Alarme de medicação: cadência, virada do dia, dono do medicamento e reenvio.
--
-- NÃO APLICADA. Criada em 14/10/2026 como arquivo; aplicar exige o roteiro de
-- docs/PLANO-IMPLEMENTACAO.md (leitura prévia da definição em produção,
-- banco de teste antes, autorização explícita). Tarefas GLYX-07, GLYX-10, GLYX-12.
--
-- O QUE ESTAVA ERRADO na definição anterior (20260718060000, com a URL trocada
-- por 20260726020000):
--
--   1. Cadência ignorada. O despachante filtrava só por horário: remédio semanal
--      com horário recebia alarme CRÍTICO todo dia — convite a dose duplicada.
--      A coluna `cadence` existia desde 07/09 e nada a lia.
--   2. Rigidez 'livre' ignorada, embora a coluna declare "sem alarme".
--   3. Virada do dia. `rt::time + interval '10 minutes'` dá a volta no relógio:
--      23:55 + 10 min = 00:05, e `t >= 23:55 and t < 00:05` nunca é verdade.
--      Horários de 23:51 a 23:59 nunca disparavam.
--   4. Horário malformado. `rt::time` sobre um valor inválido lança erro e
--      aborta a função — o envio de TODOS os usuários, não só o dele.
--   5. Dono do medicamento. O adiamento juntava `medications` sem conferir o
--      dono: quem conhecesse o UUID de um remédio alheio recebia nome e dose
--      dele por push.
--   6. Entrega sem confirmação. O anti-duplicação era gravado ANTES do POST,
--      que é "dispara e esquece": se a rota falhasse, o alarme sumia sem
--      registro e nunca era reenviado.
--
-- DECISÕES D1–D3 (aprovadas em 15/10/2026 — docs/DECISOES-D1-D4.md):
--   D1 o alarme dos itens antigos continua como sempre: cadência NULA com
--      horário toca todo dia. A frequência passa a ser escolha EXPLÍCITA em
--      cadastro novo (regra do app), e `cadence_confirmed_at` separa a
--      frequência escolhida da presumida — nula = "frequência a confirmar".
--      Nada aqui altera horário ou frequência de item existente.
--   D2 intervalo conta da data de início escolhida e não dispara antes dela.
--   D3 rigidez 'livre' não recebe alarme implícito, mesmo com horário: é
--      configuração inconsistente, que o app mostra e só ativa com escolha
--      explícita de frequência e programação.
--
-- O CONTRATO desta seleção está em lib/medications/cadence-casos.json, usado
-- pelo teste TypeScript (local) e por supabase/tests/med_alarms_due.sql (banco
-- de teste). Os dois têm de concordar.
--
-- Reexecutável: colunas com `if not exists`, constraint com `drop` antes,
-- funções com `create or replace`.

-- ---------------------------------------------------------------------------
-- 1. Estado do despacho
-- ---------------------------------------------------------------------------
-- Aditivo. O default 'enviado' mantém os outros despachantes (dica, água,
-- sensor parado, sugestão) exatamente como estão: eles não pedem confirmação,
-- e as linhas antigas não são reivindicadas para reenvio.
alter table public.push_dispatch_log
  add column if not exists status text not null default 'enviado';
alter table public.push_dispatch_log drop constraint if exists push_dispatch_log_status_valido;
alter table public.push_dispatch_log
  add constraint push_dispatch_log_status_valido
    check (status in ('pendente', 'enviando', 'enviado', 'falhou', 'sem_assinatura'));

alter table public.push_dispatch_log add column if not exists attempts integer not null default 1;
alter table public.push_dispatch_log add column if not exists last_attempt_at timestamptz;
alter table public.push_dispatch_log add column if not exists confirmed_at timestamptz;
alter table public.push_dispatch_log add column if not exists last_error text;
-- Instante previsto do aviso (UTC). Define a validade do reenvio.
alter table public.push_dispatch_log add column if not exists scheduled_at timestamptz;
-- Conteúdo do aviso, gravado uma vez: o reenvio é idêntico ao primeiro envio.
alter table public.push_dispatch_log add column if not exists payload jsonb;

create index if not exists push_dispatch_log_em_aberto_idx
  on public.push_dispatch_log (status, last_attempt_at)
  where status in ('pendente', 'enviando', 'falhou');

comment on column public.push_dispatch_log.status is
  'pendente (aguardando 1º envio) | enviando (reivindicado, sem confirmação) | enviado | falhou (reenvia até 3x em 30 min) | sem_assinatura. Default enviado: despachantes que não pedem confirmação.';

-- ---------------------------------------------------------------------------
-- 1b. Frequência confirmada (D1)
-- ---------------------------------------------------------------------------
-- Aditivo e sem backfill: TODO item existente fica com nulo ("a confirmar"),
-- inclusive os que a migration de 07/09 marcou 'diaria' por presunção. Só a
-- escolha explícita no app preenche. O despachante NÃO lê esta coluna — o
-- alarme dos itens antigos continua igual.
alter table public.medications add column if not exists cadence_confirmed_at timestamptz;
comment on column public.medications.cadence_confirmed_at is
  'Quando a pessoa escolheu ou confirmou a frequência explicitamente. Nulo = frequência presumida, a confirmar (D1). Não afeta o alarme.';

-- ---------------------------------------------------------------------------
-- 2. Fuso válido
-- ---------------------------------------------------------------------------
-- `at time zone 'texto-inválido'` lança erro e derrubaria o envio de todos.
create or replace function public.glyx_fuso_valido(p_tz text)
returns text
language sql
stable
set search_path = public
as $$
  select coalesce(
    (select name from pg_timezone_names where name = nullif(trim(p_tz), '') limit 1),
    'America/Sao_Paulo'
  );
$$;

-- ---------------------------------------------------------------------------
-- 3. Dia de dose — espelho de lib/medications/cadence.ts (ehDiaDeDose)
-- ---------------------------------------------------------------------------
create or replace function public.med_alarm_is_dose_day(
  p_cadence text,
  p_weekday smallint,
  p_interval smallint,
  p_anchor date,
  p_dose_date date
)
returns boolean
language sql
immutable
set search_path = public
as $$
  select case
    -- 0 = domingo … 6 = sábado, igual a Date.getUTCDay().
    when p_cadence = 'semanal' and p_weekday is not null
      then extract(dow from p_dose_date)::int = p_weekday
    -- date - date = número inteiro de dias: sem efeito de horário de verão. D2.
    when p_cadence = 'intervalo' and p_interval is not null and p_anchor is not null
      then (p_dose_date - p_anchor) >= 0 and (p_dose_date - p_anchor) % p_interval = 0
    -- diária, nula ou pela metade: todo dia (D1).
    else true
  end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Doses vencidas agora — espelho de dosesVencidasParaAlarme
-- ---------------------------------------------------------------------------
-- Recebe "agora" por parâmetro para ser testável com instante fixo.
-- Considera as doses de HOJE e de ONTEM no fuso do usuário: a de 23:55 vence às
-- 00:02 do dia seguinte, e a cadência dela é a do dia em que foi prevista.
create or replace function public.med_alarms_due(p_now timestamptz)
returns table (
  user_id uuid,
  med_id uuid,
  dose_time text,
  dose_date date,
  scheduled_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with ctx as (
    select m.id, m.user_id, m.reminder_times,
           m.cadence, m.cadence_weekday, m.cadence_interval_days, m.cadence_anchor_on,
           public.glyx_fuso_valido(p.timezone) as tz
    from public.medications m
    join public.profiles p on p.id = m.user_id
    where m.active
      and not p.disabled
      and m.timing_strictness is distinct from 'livre'          -- D3
      and m.reminder_times is not null
  ),
  horarios as (
    select c.*, rt.t,
           -- CASE garante a ordem: o cast só roda sobre texto já validado.
           case when rt.t ~ '^([01]?[0-9]|2[0-3]):[0-5][0-9]$' then rt.t::time end as hora
    from ctx c
    cross join lateral unnest(c.reminder_times) as rt(t)
  ),
  candidatos as (
    select h.user_id, h.id as med_id, h.t as dose_time, d.dose_date,
           ((d.dose_date + h.hora) at time zone h.tz) as scheduled_at,
           h.cadence, h.cadence_weekday, h.cadence_interval_days, h.cadence_anchor_on
    from horarios h
    cross join lateral (
      values ((p_now at time zone h.tz)::date), ((p_now at time zone h.tz)::date - 1)
    ) as d(dose_date)
    where h.hora is not null
  )
  select c.user_id, c.med_id, c.dose_time, c.dose_date, c.scheduled_at
  from candidatos c
  where p_now >= c.scheduled_at
    and p_now < c.scheduled_at + interval '10 minutes'
    and public.med_alarm_is_dose_day(
      c.cadence, c.cadence_weekday, c.cadence_interval_days, c.cadence_anchor_on, c.dose_date
    );
$$;

-- ---------------------------------------------------------------------------
-- 5. Despachante
-- ---------------------------------------------------------------------------
create or replace function public.dispatch_med_alarms()
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  cron_secret text;
  reivindicados uuid[];
  payload jsonb;
begin
  select decrypted_secret into cron_secret
    from vault.decrypted_secrets where name = 'cgm_cron_secret' limit 1;
  if cron_secret is null then
    raise exception 'Segredo cgm_cron_secret ausente no Vault.';
  end if;

  -- 5a. Doses vencidas → 'pendente'. O unique (user_id, kind, ref, sent_on) é o
  -- anti-duplicação; `sent_on` passa a ser a data da DOSE, não a de agora.
  insert into public.push_dispatch_log
    (user_id, kind, ref, sent_on, status, attempts, scheduled_at, payload)
  select d.user_id, 'med', d.med_id::text || '@' || d.dose_time, d.dose_date,
         'pendente', 0, d.scheduled_at,
         jsonb_build_object(
           'title', case when m.kind = 'supplement' then '💪 Hora do suplemento' else '⏰ Hora do medicamento' end,
           'body', m.name || coalesce(' ' || m.dosage, '') || ' (' || d.dose_time || ')',
           'critical', (m.kind <> 'supplement'),
           'medId', m.id::text,
           'scheduledFor', to_char(d.scheduled_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
         )
  from public.med_alarms_due(now()) d
  join public.medications m on m.id = d.med_id and m.user_id = d.user_id
  on conflict (user_id, kind, ref, sent_on) do nothing;

  -- 5b. Reposição de estoque: mesma regra de antes (09:00 local, ≤ 7 dias).
  -- Consumo por cadência fica para GLYX-14.
  insert into public.push_dispatch_log
    (user_id, kind, ref, sent_on, status, attempts, scheduled_at, payload)
  select r.user_id, 'refill', r.med_id::text || '@refill', r.local_date,
         'pendente', 0, now(),
         jsonb_build_object(
           'title', case when r.kind = 'supplement' then '🛒 Hora de repor: ' || r.name else '💊 Hora de repor: ' || r.name end,
           'body', case
             when r.days_left <= 0 then 'O estoque de ' || r.name || ' pode ter acabado. Compre hoje e atualize o estoque no app.'
             else 'Estoque de ' || r.name || ' para ~' || r.days_left || ' dia(s). Programe a compra.'
           end,
           'critical', false
         )
  from (
    select c.user_id, c.id as med_id, c.name, c.kind,
           floor((c.stock_units - ((now() at time zone c.tz)::date - c.stock_updated_on) * c.dpd)::numeric / c.dpd)::int as days_left,
           (now() at time zone c.tz)::date as local_date
    from (
      select m.*, public.glyx_fuso_valido(p.timezone) as tz,
             greatest(coalesce(array_length(m.reminder_times, 1), 1), 1) as dpd
      from public.medications m
      join public.profiles p on p.id = m.user_id
      where m.active and not p.disabled
    ) c
    where c.stock_units is not null
      and c.stock_updated_on is not null
      and (now() at time zone c.tz)::time >= time '09:00'
      and (now() at time zone c.tz)::time < time '09:10'
      and floor((c.stock_units - ((now() at time zone c.tz)::date - c.stock_updated_on) * c.dpd)::numeric / c.dpd) <= 7
  ) r
  on conflict (user_id, kind, ref, sent_on) do nothing;

  -- 5c. Adiamentos vencidos → 'pendente'. O medicamento tem de ser do MESMO
  -- usuário do adiamento (item 5 do cabeçalho). `skip locked` evita que duas
  -- rodadas sobrepostas peguem o mesmo adiamento.
  with vencidos as (
    select s.id, s.user_id, s.snoozed_until, m.id as med_id, m.name, m.dosage, m.kind,
           public.glyx_fuso_valido(p.timezone) as tz
    from public.medication_snoozes s
    join public.medications m on m.id = s.medication_id and m.user_id = s.user_id
    join public.profiles p on p.id = s.user_id
    where not s.fired
      and s.snoozed_until <= now()
      and not p.disabled
      and m.timing_strictness is distinct from 'livre'
    for update of s skip locked
  ),
  marcados as (
    update public.medication_snoozes s
      set fired = true
      from vencidos v
      where s.id = v.id
      returning s.id
  )
  insert into public.push_dispatch_log
    (user_id, kind, ref, sent_on, status, attempts, scheduled_at, payload)
  select v.user_id, 'snooze', v.id::text, (v.snoozed_until at time zone v.tz)::date,
         'pendente', 0, v.snoozed_until,
         jsonb_build_object(
           'title', case when v.kind = 'supplement' then '💪 Lembrete adiado' else '⏰ Lembrete adiado' end,
           'body', v.name || coalesce(' ' || v.dosage, '') || ' — hora de tomar agora',
           'critical', (v.kind <> 'supplement'),
           'medId', v.med_id::text
         )
  from vencidos v
  where v.id in (select id from marcados)
  on conflict (user_id, kind, ref, sent_on) do nothing;

  -- 5d. Reivindicar o que deve sair agora: novos, falhos e 'enviando' sem
  -- confirmação há mais de 4 min (a rota caiu antes de confirmar). Até 3
  -- tentativas, e só dentro da validade — alarme de remédio de uma hora atrás
  -- não deve tocar como se fosse agora. `for update skip locked`: duas rodadas
  -- sobrepostas nunca reivindicam o mesmo alarme.
  with alvo as (
    select l.id
    from public.push_dispatch_log l
    where l.kind in ('med', 'refill', 'snooze')
      and l.status in ('pendente', 'falhou', 'enviando')
      and (l.status <> 'enviando' or l.last_attempt_at < now() - interval '4 minutes')
      and l.attempts < 3
      and coalesce(l.scheduled_at, l.created_at) > now() - case
            when l.kind = 'refill' then interval '2 hours'
            else interval '30 minutes'
          end
    for update skip locked
  ),
  atualizados as (
    update public.push_dispatch_log l
      set status = 'enviando', attempts = l.attempts + 1, last_attempt_at = now()
      from alvo
      where l.id = alvo.id
      returning l.id
  )
  select array_agg(id) into reivindicados from atualizados;

  if reivindicados is null then
    return;
  end if;

  -- 5e. Sem assinatura ativa não há para onde enviar: encerra em vez de
  -- reenviar três vezes para lugar nenhum.
  update public.push_dispatch_log l
    set status = 'sem_assinatura', confirmed_at = now(), last_error = 'nenhuma assinatura de push ativa'
    where l.id = any(reivindicados)
      and not exists (select 1 from public.push_subscriptions s where s.user_id = l.user_id);

  -- 5f. Um item por (alarme × aparelho). `dispatchId` é o que a rota usa para
  -- confirmar; `tag` é uma por dose e funde no aparelho um reenvio duplicado.
  select jsonb_agg(jsonb_build_object(
    'endpoint', s.endpoint,
    'p256dh', s.p256dh,
    'auth', s.auth,
    'title', l.payload ->> 'title',
    'body', coalesce(l.payload ->> 'body', ''),
    'critical', coalesce((l.payload ->> 'critical')::boolean, false),
    'medId', l.payload ->> 'medId',
    'scheduledFor', l.payload ->> 'scheduledFor',
    'tag', 'glyx-' || l.kind || '-' || l.ref || '-' || l.sent_on::text,
    'dispatchId', l.id::text
  ))
  into payload
  from public.push_dispatch_log l
  join public.push_subscriptions s on s.user_id = l.user_id
  where l.id = any(reivindicados)
    and l.status = 'enviando'
    and l.payload ->> 'title' is not null;

  if payload is not null then
    perform net.http_post(
      url := public.app_base_url() || '/api/push/dispatch',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', cron_secret
      ),
      body := payload
    );
  end if;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 6. Ninguém de fora chama estas funções
-- ---------------------------------------------------------------------------
-- O Postgres concede EXECUTE a PUBLIC na criação. Só o pg_cron (dono) chama.
revoke all on function public.glyx_fuso_valido(text) from public, anon, authenticated;
revoke all on function public.med_alarm_is_dose_day(text, smallint, smallint, date, date) from public, anon, authenticated;
revoke all on function public.med_alarms_due(timestamptz) from public, anon, authenticated;
revoke all on function public.dispatch_med_alarms() from public, anon, authenticated;
