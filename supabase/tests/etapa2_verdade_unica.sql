-- Migrations da Etapa 2 (verdade única): 20261031110000 (pico pós-refeição) e
-- 20261031111000 (evento de hipoglicemia na ingestão).
--
-- RODA SÓ EM BANCO DE TESTE (GLYX-03). Transação desfeita no fim.
--   psql "$URL_DO_BANCO_DE_TESTE" -v ON_ERROR_STOP=1 -f supabase/tests/etapa2_verdade_unica.sql

begin;

create temp table ids (a uuid, b uuid, c uuid) on commit drop;
insert into ids values (gen_random_uuid(), gen_random_uuid(), gen_random_uuid());

insert into auth.users (id, email) select a, a::text || '@teste.invalid' from ids;
insert into auth.users (id, email) select b, b::text || '@teste.invalid' from ids;
insert into auth.users (id, email) select c, c::text || '@teste.invalid' from ids;
insert into public.profiles (id) select a from ids on conflict (id) do nothing;
insert into public.profiles (id) select b from ids on conflict (id) do nothing;
insert into public.profiles (id) select c from ids on conflict (id) do nothing;

-- A: meta 70–140 e plano de hipo com limiar 75. B: faixa padrão (sem meta
-- própria). C: meta 80–180, sem plano.
update public.profiles set target_glucose_min = 70, target_glucose_max = 140 where id = (select a from ids);
update public.profiles set target_glucose_min = null, target_glucose_max = null where id = (select b from ids);
update public.profiles set target_glucose_min = 80, target_glucose_max = 180 where id = (select c from ids);
insert into public.hypo_plan (user_id, correction_text, recheck_minutes, threshold_mg_dl)
  select a, 'Suco de laranja, 150 ml.', 15, 75 from ids;

-- ---------------------------------------------------------------------------
-- B2 — evento de hipoglicemia nasce na ingestão
-- ---------------------------------------------------------------------------
do $$
declare
  v ids%rowtype;
  n int;
begin
  select * into v from ids;

  -- Abaixo do limiar DO PLANO (75), mesmo acima da meta mínima (70): abre.
  insert into public.glucose_readings (user_id, value_mg_dl, recorded_at, source)
    values (v.a, 72, now() - interval '2 minutes', 'libre');
  select count(*) into n from public.hypo_events where user_id = v.a;
  if n <> 1 then raise exception 'FALHOU: leitura abaixo do limiar do plano deveria abrir 1 evento, abriu %', n; end if;

  -- Segunda leitura baixa no mesmo episódio: não abre outro.
  insert into public.glucose_readings (user_id, value_mg_dl, recorded_at, source)
    values (v.a, 66, now() - interval '1 minute', 'libre');
  select count(*) into n from public.hypo_events where user_id = v.a;
  if n <> 1 then raise exception 'FALHOU: mesmo episódio abriu % eventos', n; end if;

  -- Leitura antiga (importação de histórico): não abre.
  insert into public.glucose_readings (user_id, value_mg_dl, recorded_at, source)
    values (v.b, 55, now() - interval '5 hours', 'csv');
  select count(*) into n from public.hypo_events where user_id = v.b;
  if n <> 0 then raise exception 'FALHOU: leitura de 5 h atrás abriu evento'; end if;

  -- Sem plano: limiar = meta mínima do perfil (80).
  insert into public.glucose_readings (user_id, value_mg_dl, recorded_at, source)
    values (v.c, 78, now(), 'manual');
  select count(*) into n from public.hypo_events where user_id = v.c;
  if n <> 1 then raise exception 'FALHOU: sem plano, 78 com meta mínima 80 deveria abrir evento'; end if;

  -- Reavaliado o episódio, a próxima leitura baixa abre um novo.
  update public.hypo_events set acted_at = now(), recheck_at = now(), recheck_mg_dl = 95 where user_id = v.a;
  insert into public.glucose_readings (user_id, value_mg_dl, recorded_at, source)
    values (v.a, 70, now(), 'libre');
  select count(*) into n from public.hypo_events where user_id = v.a;
  if n <> 2 then raise exception 'FALHOU: episódio fechado deveria permitir um novo (tem %)', n; end if;

  raise notice 'B2 evento de hipo: 5 cenários aprovados';
end;
$$;

-- Demonstração não abre episódio (só se o banco aceitar a fonte 'mock').
do $$
declare
  v ids%rowtype;
  n int;
begin
  select * into v from ids;
  begin
    insert into public.glucose_readings (user_id, value_mg_dl, recorded_at, source)
      values (v.b, 50, now(), 'mock');
  exception when check_violation then
    raise notice 'B2: fonte mock recusada pelo banco (cenário não se aplica)';
    return;
  end;
  select count(*) into n from public.hypo_events where user_id = v.b;
  if n <> 0 then raise exception 'FALHOU: leitura de demonstração abriu evento'; end if;
  delete from public.glucose_readings where user_id = v.b and source = 'mock';
  raise notice 'B2: demonstração não abre episódio';
end;
$$;

-- ---------------------------------------------------------------------------
-- B9 — pico pós-refeição com a meta do perfil e base recente
-- ---------------------------------------------------------------------------
do $$
declare
  v ids%rowtype;
  m_a uuid;
  m_b uuid;
  m_c uuid;
  r boolean;
begin
  select * into v from ids;

  -- A (meta máx. 140): base 100 há 10 min, pico 150 → acima da meta: pico.
  insert into public.meals (user_id, name, eaten_at) values (v.a, 'almoço', now() - interval '3 hours') returning id into m_a;
  insert into public.glucose_readings (user_id, value_mg_dl, recorded_at, source) values
    (v.a, 100, now() - interval '3 hours 10 minutes', 'libre'),
    (v.a, 150, now() - interval '2 hours 30 minutes', 'libre');

  -- B (meta padrão 180): base de 17 h antes (velha) e pico 160. Pela regra
  -- antiga o delta de 110 contra a base velha marcava pico; agora não.
  insert into public.meals (user_id, name, eaten_at) values (v.b, 'jantar', now() - interval '3 hours') returning id into m_b;
  insert into public.glucose_readings (user_id, value_mg_dl, recorded_at, source) values
    (v.b, 50, now() - interval '20 hours', 'libre'),
    (v.b, 160, now() - interval '2 hours 30 minutes', 'libre');

  -- C (meta máx. 180): 180 exato está NA meta (régua > meta, B4); base 120
  -- recente, delta 60 → pico pelo delta, não pela meta.
  insert into public.meals (user_id, name, eaten_at) values (v.c, 'lanche', now() - interval '3 hours') returning id into m_c;
  insert into public.glucose_readings (user_id, value_mg_dl, recorded_at, source) values
    (v.c, 120, now() - interval '3 hours 5 minutes', 'manual'),
    (v.c, 180, now() - interval '2 hours 20 minutes', 'manual');

  perform public.evaluate_meal_glucose_spikes();

  select glucose_spike into r from public.meals where id = m_a;
  if r is distinct from true then raise exception 'FALHOU: 150 com meta 140 deveria ser pico (%).', r; end if;
  select glucose_spike into r from public.meals where id = m_b;
  if r is distinct from false then raise exception 'FALHOU: base de 17 h não pode gerar pico por delta (%).', r; end if;
  select glucose_spike into r from public.meals where id = m_c;
  if r is distinct from true then raise exception 'FALHOU: delta de 60 com base recente deveria ser pico (%).', r; end if;

  -- Meta incoerente cai no padrão 180.
  if public.glyx_meta_maxima(150, 140) <> 180 or public.glyx_meta_minima(150, 140) <> 70 then
    raise exception 'FALHOU: faixa incoerente deveria cair no padrão 70–180';
  end if;

  raise notice 'B9 pico pós-refeição: 4 cenários aprovados';
end;
$$;

-- Permissões: o gatilho e o job não são chamáveis pelo cliente.
do $$
begin
  if has_function_privilege('authenticated', 'public.abrir_evento_de_hipo()', 'execute') then
    raise exception 'FALHOU: authenticated executa abrir_evento_de_hipo';
  end if;
  if has_function_privilege('authenticated', 'public.evaluate_meal_glucose_spikes()', 'execute') then
    raise exception 'FALHOU: authenticated executa evaluate_meal_glucose_spikes';
  end if;
end;
$$;

rollback;
