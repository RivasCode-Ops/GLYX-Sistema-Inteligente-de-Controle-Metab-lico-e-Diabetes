-- Despachante de alarmes: estado, reivindicação, reenvio e dono do medicamento.
--
-- RODA SÓ EM BANCO DE TESTE (GLYX-03), depois das migrations. Nunca em
-- produção. Tudo numa transação desfeita no fim: nenhuma requisição do pg_net
-- sai, porque a fila só é enviada depois de um commit.
--
--   psql "$URL_DO_BANCO_DE_TESTE" -v ON_ERROR_STOP=1 -f supabase/tests/dispatch_med_alarms.sql
--
-- `now()` é fixo dentro da transação, o que torna os cenários determinísticos.
-- E-mails gerados a partir do UUID: não colidem com usuários que já existam.
--
-- REPRODUÇÃO DO DEFEITO: rodado contra a definição anterior de
-- dispatch_med_alarms (20260718060000), o cenário 1 falha — o semanal fora do
-- dia ganha linha 'med'. Conferido em 14/10/2026 no banco descartável.

begin;

-- Vault de teste: segredo próprio e URL que não é produção. Sem `app_base_url`,
-- a função cairia no domínio de produção (20260726020000).
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'cgm_cron_secret') then
    perform vault.create_secret('segredo-de-teste', 'cgm_cron_secret', 'teste local');
  end if;
  if exists (select 1 from vault.secrets where name = 'app_base_url') then
    perform vault.update_secret(
      (select id from vault.secrets where name = 'app_base_url'),
      'http://127.0.0.1:9'
    );
  else
    perform vault.create_secret('http://127.0.0.1:9', 'app_base_url', 'teste local');
  end if;
end;
$$;

do $$
declare
  tz constant text := 'America/Sao_Paulo';
  agora_local timestamp := now() at time zone tz;
  hora text := to_char(agora_local - interval '1 minute', 'HH24:MI');
  hoje_dow int := extract(dow from agora_local::date)::int;
  u_com uuid := gen_random_uuid();     -- tem assinatura de push
  u_sem uuid := gen_random_uuid();     -- não tem
  u_outro uuid := gen_random_uuid();   -- dono de um remédio alheio
  m_diaria uuid := gen_random_uuid();
  m_semanal_outro_dia uuid := gen_random_uuid();
  m_sem uuid := gen_random_uuid();
  m_alheio uuid := gen_random_uuid();
  l record;
  n int;
begin
  insert into auth.users (id, email) values
    (u_com, u_com::text || '@teste.invalid'),
    (u_sem, u_sem::text || '@teste.invalid'),
    (u_outro, u_outro::text || '@teste.invalid');
  insert into public.profiles (id) values (u_com), (u_sem), (u_outro) on conflict (id) do nothing;
  update public.profiles set timezone = tz, disabled = false where id in (u_com, u_sem, u_outro);

  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
    values (u_com, 'https://push.teste.invalid/' || u_com, 'p', 'a');

  insert into public.medications (id, user_id, name, kind, active, reminder_times, cadence, cadence_weekday) values
    (m_diaria, u_com, 'Diária', 'med', true, array[hora], 'diaria', null),
    (m_semanal_outro_dia, u_com, 'Semanal de outro dia', 'med', true, array[hora], 'semanal', ((hoje_dow + 1) % 7)::smallint),
    (m_sem, u_sem, 'Sem assinatura', 'med', true, array[hora], 'diaria', null),
    (m_alheio, u_outro, 'Remédio alheio', 'med', true, null, null, null);

  -- Adiamento vencido de u_com apontando para o remédio de u_outro: o caso do
  -- vazamento. Inserido como postgres (sem RLS), como já pode existir no banco.
  insert into public.medication_snoozes (user_id, medication_id, snoozed_until, scheduled_for, attempt)
    values (u_com, m_alheio, now() - interval '1 minute', now() - interval '16 minutes', 1);

  perform public.dispatch_med_alarms();

  -- Cenário 1 — cadência: semanal fora do dia não gera alarme.
  select count(*) into n from public.push_dispatch_log
    where user_id = u_com and kind = 'med' and ref like m_semanal_outro_dia::text || '@%';
  if n <> 0 then raise exception 'cenário 1: semanal fora do dia gerou % alarme(s)', n; end if;

  -- Cenário 2 — reivindicação: a diária foi reivindicada uma vez, com conteúdo.
  select * into l from public.push_dispatch_log
    where user_id = u_com and kind = 'med' and ref = m_diaria::text || '@' || hora;
  if l.status <> 'enviando' or l.attempts <> 1 or l.payload ->> 'title' is null then
    raise exception 'cenário 2: esperado enviando/1 com payload, obtido %/%', l.status, l.attempts;
  end if;

  -- Cenário 3 — sem reenvio enquanto a confirmação ainda pode chegar (< 4 min).
  perform public.dispatch_med_alarms();
  select attempts into n from public.push_dispatch_log where id = l.id;
  if n <> 1 then raise exception 'cenário 3: reenviou cedo demais (attempts = %)', n; end if;

  -- Cenário 4 — a rota caiu sem confirmar: depois de 4 min, reenvia.
  update public.push_dispatch_log set last_attempt_at = now() - interval '5 minutes' where id = l.id;
  perform public.dispatch_med_alarms();
  select attempts into n from public.push_dispatch_log where id = l.id;
  if n <> 2 then raise exception 'cenário 4: esperado reenvio (attempts = 2), obtido %', n; end if;

  -- Cenário 5 — limite: com 3 tentativas, não reivindica mais.
  update public.push_dispatch_log set attempts = 3, status = 'falhou' where id = l.id;
  perform public.dispatch_med_alarms();
  select attempts into n from public.push_dispatch_log where id = l.id;
  if n <> 3 then raise exception 'cenário 5: passou do limite (attempts = %)', n; end if;

  -- Cenário 6 — usuário sem assinatura: encerra como sem_assinatura.
  select count(*) into n from public.push_dispatch_log
    where user_id = u_sem and kind = 'med' and status = 'sem_assinatura';
  if n <> 1 then raise exception 'cenário 6: esperado 1 sem_assinatura, obtido %', n; end if;

  -- Cenário 7 — dono do medicamento: o adiamento com remédio alheio não dispara.
  select count(*) into n from public.push_dispatch_log where user_id = u_com and kind = 'snooze';
  if n <> 0 then raise exception 'cenário 7: adiamento com remédio de outra conta disparou'; end if;
  select count(*) into n from public.medication_snoozes where medication_id = m_alheio and fired;
  if n <> 0 then raise exception 'cenário 7: adiamento com remédio de outra conta foi marcado como disparado'; end if;

  raise notice 'dispatch_med_alarms: 7 cenários aprovados';
end;
$$;

rollback;
