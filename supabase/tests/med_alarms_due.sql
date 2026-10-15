-- Contrato de public.med_alarms_due — mesmos casos de lib/medications/cadence-casos.json.
--
-- RODA SÓ EM BANCO DE TESTE (GLYX-03). Nunca em produção: cria usuários em
-- auth.users. Tudo dentro de uma transação desfeita no fim (rollback).
--
-- Como rodar, depois de aplicar as migrations no banco de teste:
--   psql "$URL_DO_BANCO_DE_TESTE" -v ON_ERROR_STOP=1 -f supabase/tests/med_alarms_due.sql
--
-- Contra a função ANTIGA (sem cadência) este arquivo falha nos casos
-- 'semanal-fora-do-dia', 'intervalo-fora', 'intervalo-antes-da-ancora',
-- 'livre-sem-alarme', 'virada-meia-noite' e 'horario-malformado' — é o defeito
-- reproduzido. (A função antiga nem existe com este nome; para reproduzir,
-- compare com o despachante antigo, ver dispatch_med_alarms.sql.)
--
-- Um teste TypeScript (lib/medications/cadence.test.ts) exige que todo id do
-- JSON apareça aqui entre aspas simples.

begin;

do $$
declare
  c record;
  u uuid;
  m uuid;
  obtido text[];
  falhas text[] := '{}';
begin
  for c in
    select * from (values
      ('semanal-no-dia', 'America/Sao_Paulo', '2026-10-14T11:02:00Z'::timestamptz, 'semanal', 3::smallint, null::smallint, null::date, null::text, true, array['08:00'], array['08:00@2026-10-14']),
      ('semanal-fora-do-dia', 'America/Sao_Paulo', '2026-10-15T11:02:00Z', 'semanal', 3, null, null, null, true, array['08:00'], '{}'::text[]),
      ('intervalo-na-ancora', 'America/Sao_Paulo', '2026-10-01T11:02:00Z', 'intervalo', null, 3, '2026-10-01'::date, null, true, array['08:00'], array['08:00@2026-10-01']),
      ('intervalo-multiplo', 'America/Sao_Paulo', '2026-10-13T11:02:00Z', 'intervalo', null, 3, '2026-10-01'::date, null, true, array['08:00'], array['08:00@2026-10-13']),
      ('intervalo-fora', 'America/Sao_Paulo', '2026-10-14T11:02:00Z', 'intervalo', null, 3, '2026-10-01'::date, null, true, array['08:00'], '{}'::text[]),
      ('intervalo-antes-da-ancora', 'America/Sao_Paulo', '2026-10-14T11:02:00Z', 'intervalo', null, 3, '2026-10-20'::date, null, true, array['08:00'], '{}'::text[]),
      ('diaria', 'America/Sao_Paulo', '2026-10-15T11:02:00Z', 'diaria', null, null, null, null, true, array['08:00'], array['08:00@2026-10-15']),
      ('nula-com-horario', 'America/Sao_Paulo', '2026-10-15T11:02:00Z', null, null, null, null, null, true, array['08:00'], array['08:00@2026-10-15']),
      ('livre-sem-alarme', 'America/Sao_Paulo', '2026-10-15T11:02:00Z', 'diaria', null, null, null, 'livre', true, array['08:00'], '{}'::text[]),
      ('virada-meia-noite', 'America/Sao_Paulo', '2026-10-15T03:02:00Z', 'diaria', null, null, null, null, true, array['23:55'], array['23:55@2026-10-14']),
      ('virada-meia-noite-semanal-dia-da-dose', 'America/Sao_Paulo', '2026-10-15T03:02:00Z', 'semanal', 3, null, null, null, true, array['23:55'], array['23:55@2026-10-14']),
      ('virada-meia-noite-semanal-outro-dia', 'America/Sao_Paulo', '2026-10-15T03:02:00Z', 'semanal', 4, null, null, null, true, array['23:55'], '{}'::text[]),
      ('fim-da-janela', 'America/Sao_Paulo', '2026-10-15T11:10:00Z', 'diaria', null, null, null, null, true, array['08:00'], '{}'::text[]),
      ('antes-do-horario', 'America/Sao_Paulo', '2026-10-15T10:59:00Z', 'diaria', null, null, null, null, true, array['08:00'], '{}'::text[]),
      ('fuso-manaus', 'America/Manaus', '2026-10-15T03:57:00Z', 'diaria', null, null, null, null, true, array['23:55'], array['23:55@2026-10-14']),
      ('fuso-sao-paulo-mesmo-instante', 'America/Sao_Paulo', '2026-10-15T03:57:00Z', 'diaria', null, null, null, null, true, array['23:55'], '{}'::text[]),
      ('horario-malformado', 'America/Sao_Paulo', '2026-10-15T11:02:00Z', 'diaria', null, null, null, null, true, array['8h', '08:00', '25:00'], array['08:00@2026-10-15']),
      ('inativo', 'America/Sao_Paulo', '2026-10-15T11:02:00Z', 'diaria', null, null, null, null, false, array['08:00'], '{}'::text[])
    ) as t(id, tz, agora, cadencia, dia_semana, intervalo, ancora, rigidez, ativo, horarios, esperado)
  loop
    u := gen_random_uuid();
    insert into auth.users (id, email) values (u, c.id || '@teste.invalid');
    insert into public.profiles (id) values (u) on conflict (id) do nothing;
    update public.profiles set timezone = c.tz, disabled = false where id = u;

    m := gen_random_uuid();
    insert into public.medications
      (id, user_id, name, kind, active, reminder_times,
       cadence, cadence_weekday, cadence_interval_days, cadence_anchor_on, timing_strictness)
    values
      (m, u, 'Teste ' || c.id, 'med', c.ativo, c.horarios,
       c.cadencia, c.dia_semana, c.intervalo, c.ancora, coalesce(c.rigidez, 'flexivel'));

    select coalesce(array_agg(d.dose_time || '@' || d.dose_date::text order by d.dose_date, d.dose_time), '{}')
      into obtido
      from public.med_alarms_due(c.agora) d
      where d.med_id = m;

    if obtido is distinct from c.esperado then
      falhas := falhas || (c.id || ': esperado ' || c.esperado::text || ', obtido ' || obtido::text);
    end if;
  end loop;

  if coalesce(array_length(falhas, 1), 0) > 0 then
    raise exception E'med_alarms_due reprovou:\n%', array_to_string(falhas, E'\n');
  end if;
  raise notice 'med_alarms_due: 18 casos aprovados';
end;
$$;

rollback;
