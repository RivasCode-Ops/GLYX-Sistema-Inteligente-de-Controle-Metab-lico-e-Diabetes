-- REVERSÃO do lote 1 INTEIRO — as quatro migrations, na ordem inversa da
-- aplicação:
--   aplicação: 20261015100000 dono → 101000 dose única → 102000 conta ativa/IA
--              → 103000 alarmes e cadência
--   reversão:  bloco 1 (103000) → bloco 2 (102000) → bloco 3 (101000) → bloco 4 (100000)
-- Cada bloco desfaz SÓ a sua migration; para desfazer uma só, rodar só o bloco
-- dela (dentro de begin/commit).
--
-- NÃO é migration: fica fora de supabase/migrations de propósito, para nunca
-- ser aplicado por engano. Usar só se a implantação precisar ser desfeita,
-- com a frase de autorização do Rivas, e SEMPRE ANTES de reverter o código:
-- o código antigo não convive com 20261015102000 (bloqueia a IA) nem com
-- 20261015103000 (alarme fica "enviando" e é reenviado). Ver
-- docs/PLANO-IMPLEMENTACAO.md §5.
--
-- ENSAIADO em 14/10/2026 (versões anteriores das migrations) e de novo em
-- 15/10/2026 com as quatro versões finais, no banco descartável (PostgreSQL 17,
-- PostgREST e Auth reais): depois deste script, o código antigo voltou ao
-- comportamento de antes — resultado em docs/PLANO-IMPLEMENTACAO.md §5.
--
-- ATENÇÃO — a definição de dispatch_med_alarms no passo 1 foi tirada do banco
-- descartável com as 72 migrations antigas aplicadas. Em produção, use de
-- preferência a definição capturada com pg_get_functiondef ANTES de aplicar o
-- lote (plano §4, passo 1); se as duas diferirem, vale a de produção.
--
-- Nada aqui apaga dado de saúde nem escolha do usuário. FICAM: as colunas novas
-- de push_dispatch_log (default 'enviado'; linhas 'pendente' ou 'enviando' viram
-- histórico e não são reenviadas); `medications.cadence_confirmed_at` (D1 — o
-- código antigo não a lê); as colunas de pedido e histórico de correções de
-- medication_logs e o rótulo `adicional` (bloco 3). O uso de IA apagado por uma
-- exclusão LGPD (D4) não volta — foi pedido da pessoa.

begin;

-- 1. Despachante: volta à definição anterior ------------------------------
create or replace function public.dispatch_med_alarms()
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  payload jsonb;
  snooze_payload jsonb;
  cron_secret text;
begin
  select decrypted_secret into cron_secret from vault.decrypted_secrets where name = 'cgm_cron_secret' limit 1;
  if cron_secret is null then
    raise exception 'Segredo cgm_cron_secret ausente no Vault.';
  end if;

  with ctx as (
    select m.*,
           coalesce(p.timezone, 'America/Sao_Paulo') as tz,
           greatest(coalesce(array_length(m.reminder_times, 1), 1), 1) as dpd
    from public.medications m
    join public.profiles p on p.id = m.user_id
    where m.active
      and not p.disabled
  ),
  due_med as (
    select c.user_id, c.id as med_id, c.name, c.dosage, c.kind, rt.t,
           (now() at time zone c.tz)::date as local_date
    from ctx c
    cross join lateral unnest(c.reminder_times) as rt(t)
    where c.reminder_times is not null
      and (now() at time zone c.tz)::time >= rt.t::time
      and (now() at time zone c.tz)::time < rt.t::time + interval '10 minutes'
  ),
  due_refill as (
    select c.user_id, c.id as med_id, c.name, c.kind,
           floor((c.stock_units - ((now() at time zone c.tz)::date - c.stock_updated_on) * c.dpd)::numeric / c.dpd)::int as days_left,
           (now() at time zone c.tz)::date as local_date
    from ctx c
    where c.stock_units is not null
      and c.stock_updated_on is not null
      and (now() at time zone c.tz)::time >= time '09:00'
      and (now() at time zone c.tz)::time < time '09:10'
      and floor((c.stock_units - ((now() at time zone c.tz)::date - c.stock_updated_on) * c.dpd)::numeric / c.dpd) <= 7
  ),
  fresh as (
    insert into public.push_dispatch_log (user_id, kind, ref, sent_on)
    select user_id, 'med', med_id::text || '@' || t, local_date from due_med
    union all
    select user_id, 'refill', med_id::text || '@refill', local_date from due_refill
    on conflict do nothing
    returning user_id, kind, ref
  ),
  messages as (
    select d.user_id, 'med' as kind, d.med_id::text || '@' || d.t as ref,
           d.med_id::text as med_id,
           case when d.kind = 'supplement' then '💪 Hora do suplemento' else '⏰ Hora do medicamento' end as title,
           d.name || coalesce(' ' || d.dosage, '') || ' (' || d.t || ')' as body,
           (d.kind <> 'supplement') as critical
    from due_med d
    union all
    select r.user_id, 'refill', r.med_id::text || '@refill',
           null::text as med_id,
           case when r.kind = 'supplement' then '🛒 Hora de repor: ' || r.name else '💊 Hora de repor: ' || r.name end,
           case
             when r.days_left <= 0 then 'O estoque de ' || r.name || ' pode ter acabado. Compre hoje e atualize o estoque no app.'
             else 'Estoque de ' || r.name || ' para ~' || r.days_left || ' dia(s). Programe a compra.'
           end,
           false
    from due_refill r
  )
  select jsonb_agg(jsonb_build_object(
    'endpoint', s.endpoint,
    'p256dh', s.p256dh,
    'auth', s.auth,
    'title', msg.title,
    'body', msg.body,
    'critical', msg.critical,
    'medId', msg.med_id
  ))
  into payload
  from fresh f
  join messages msg on msg.user_id = f.user_id and msg.kind = f.kind and msg.ref = f.ref
  join public.push_subscriptions s on s.user_id = msg.user_id;

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

  with due_snooze as (
    select s.id, s.user_id, s.medication_id, m.name, m.dosage, m.kind
    from public.medication_snoozes s
    join public.medications m on m.id = s.medication_id
    join public.profiles p on p.id = s.user_id
    where not s.fired and s.snoozed_until <= now() and not p.disabled
  ),
  marked as (
    update public.medication_snoozes
    set fired = true
    where id in (select id from due_snooze)
    returning id
  )
  select jsonb_agg(jsonb_build_object(
    'endpoint', sub.endpoint,
    'p256dh', sub.p256dh,
    'auth', sub.auth,
    'title', case when ds.kind = 'supplement' then '💪 Lembrete adiado' else '⏰ Lembrete adiado' end,
    'body', ds.name || coalesce(' ' || ds.dosage, '') || ' — hora de tomar agora',
    'critical', (ds.kind <> 'supplement'),
    'medId', ds.medication_id::text
  ))
  into snooze_payload
  from due_snooze ds
  join public.push_subscriptions sub on sub.user_id = ds.user_id
  where ds.id in (select id from marked);

  if snooze_payload is not null then
    perform net.http_post(
      url := public.app_base_url() || '/api/push/dispatch',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', cron_secret
      ),
      body := snooze_payload
    );
  end if;
end;
$function$;

revoke all on function public.dispatch_med_alarms() from public, anon, authenticated;
drop function if exists public.med_alarms_due(timestamptz);
drop function if exists public.med_alarm_is_dose_day(text, smallint, smallint, date, date);
drop function if exists public.glyx_fuso_valido(text);

-- 2. Conta ativa e uso de IA (20261015102000) ------------------------------
do $$
declare t text;
begin
  for t in select tablename from pg_policies where schemaname = 'public' and policyname = 'conta_ativa' loop
    execute format('drop policy conta_ativa on public.%I', t);
  end loop;
end $$;
drop policy if exists "glyx_conta_ativa_fotos" on storage.objects;
drop function if exists public.conta_ativa();

drop policy if exists "ai_usage_select_own" on public.ai_usage;
drop policy if exists "ai_usage_own" on public.ai_usage;
create policy "ai_usage_own" on public.ai_usage for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop function if exists public.consumir_cota_ia(text, integer, integer);
drop function if exists public.registrar_tokens_ia(uuid, integer, integer, text);
drop function if exists public.apagar_meu_uso_de_ia();

-- 3. Dose única prospectiva, pedido e correção (20261015101000) -------------
-- Índices e gatilho saem: com eles, o código antigo recusaria o segundo
-- registro na mesma dose sem avisar. As COLUNAS e o rótulo `adicional` FICAM:
-- guardam pedidos e o histórico de correções já feitos (dado do usuário), e o
-- código antigo não os lê nem os escreve.
drop index if exists public.medication_logs_dose_confirmada_unica;
drop index if exists public.medication_logs_pedido_unico;
drop trigger if exists medication_logs_protege_historico on public.medication_logs;
drop function if exists public.medication_logs_protege_historico();

-- 4. Policies de dono do medicamento (20261015100000) ----------------------
drop policy if exists "medication_snoozes_own" on public.medication_snoozes;
create policy "medication_snoozes_own" on public.medication_snoozes for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "med_logs_all_own" on public.medication_logs;
create policy "med_logs_all_own" on public.medication_logs for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

commit;
