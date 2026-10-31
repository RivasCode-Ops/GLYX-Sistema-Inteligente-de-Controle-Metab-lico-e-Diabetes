-- Migrations da Etapa 1 do programa da IA gestora (20261031100000 a 104000).
--
-- RODA SÓ EM BANCO DE TESTE (GLYX-03). Transação desfeita no fim.
--   psql "$URL_DO_BANCO_DE_TESTE" -v ON_ERROR_STOP=1 -f supabase/tests/etapa1_seguranca.sql
--
-- Contra o banco SEM as migrations, os blocos A3, A1, C7 e A8 falham — é o
-- defeito de cada um.

begin;

create temp table ids (a uuid, b uuid) on commit drop;
insert into ids values (gen_random_uuid(), gen_random_uuid());
grant select on ids to authenticated;

insert into auth.users (id, email) select a, a::text || '@teste.invalid' from ids;
insert into auth.users (id, email) select b, b::text || '@teste.invalid' from ids;
insert into public.profiles (id) select a from ids on conflict (id) do nothing;
insert into public.profiles (id) select b from ids on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- A3 — push_dispatch_log: o usuário não forja nem bloqueia alarme
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', (select a from ids), 'role', 'authenticated')::text, true);

do $$
declare
  v ids%rowtype;
  n int;
begin
  select * into v from ids;

  -- Alarme forjado (o despachante reivindicaria): recusado.
  begin
    insert into public.push_dispatch_log (user_id, kind, ref, sent_on, status, attempts, payload)
      values (v.a, 'med', 'forjado@08:00', current_date, 'pendente', 0, '{"title":"x"}');
    raise exception 'FALHOU: usuário inseriu alarme pendente com payload';
  exception when insufficient_privilege then null;
  end;

  -- Linha antecipada que ocuparia o slot único da dose de amanhã: recusada.
  begin
    insert into public.push_dispatch_log (user_id, kind, ref, sent_on)
      values (v.a, 'med', 'remedio@08:00', current_date + 1);
    raise exception 'FALHOU: usuário ocupou o slot de um alarme de remédio';
  exception when insufficient_privilege then null;
  end;

  -- As travas de alerta que o app grava com a sessão continuam funcionando.
  insert into public.push_dispatch_log (user_id, kind, ref, sent_on)
    values (v.a, 'metabolic_alert', 'hypoglycemia@manual@x', current_date);
  insert into public.push_dispatch_log (user_id, kind, ref, sent_on)
    values (v.a, 'hypo', 'trend@x', current_date);

  -- Não altera linha nenhuma (nem a própria).
  update public.push_dispatch_log set status = 'pendente' where user_id = v.a;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALHOU: usuário alterou % linha(s) do log', n; end if;

  -- Lê e apaga as próprias (exclusão LGPD).
  select count(*) into n from public.push_dispatch_log where user_id = v.a;
  if n <> 2 then raise exception 'FALHOU: esperava ler 2 linhas próprias, li %', n; end if;
  delete from public.push_dispatch_log where user_id = v.a;
  get diagnostics n = row_count;
  if n <> 2 then raise exception 'FALHOU: esperava apagar 2 linhas, apaguei %', n; end if;

  raise notice 'A3 push_dispatch_log: 6 cenários aprovados';
end;
$$;

-- ---------------------------------------------------------------------------
-- C7 — teto global de gasto de IA
-- ---------------------------------------------------------------------------
reset role;
-- 1 milhão de tokens de entrada na Kimi = US$ 0,95 hoje.
insert into public.ai_usage (user_id, kind, prompt_tokens, completion_tokens, model)
  select a, 'chat', 1000000, 0, 'kimi-k2.6' from ids;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', (select b from ids), 'role', 'authenticated')::text, true);

do $$
declare
  precos constant jsonb := '{"kimi":{"entrada":0.95,"saida":4},"anthropic":{"entrada":2,"saida":10},"openai":{"entrada":0.15,"saida":0.6}}';
  base numeric;
begin
  -- O gasto já existente no banco de teste entra na conta; mede a partir dele.
  if not public.ia_dentro_do_teto(precos, 1000000, 1000000) then
    raise exception 'FALHOU: teto enorme deveria estar dentro';
  end if;
  -- Teto diário abaixo do gasto de hoje (≥ US$ 0,95 da linha inserida): fora.
  if public.ia_dentro_do_teto(precos, 0.5, 1000000) then
    raise exception 'FALHOU: US$ 0,95 gastos hoje deveriam estourar teto de US$ 0,50';
  end if;
  -- Teto mensal abaixo do gasto: fora, mesmo com o diário folgado.
  if public.ia_dentro_do_teto(precos, 1000000, 0.5) then
    raise exception 'FALHOU: teto mensal de US$ 0,50 deveria estar estourado';
  end if;
  -- O usuário B enxerga só o booleano, e a soma é de TODAS as contas (o gasto é de A).
  raise notice 'C7 teto global: 3 cenários aprovados';
end;
$$;

-- Permissões conferidas pela CONCESSÃO, não chamando a função como o papel
-- barrado: no Supabase local (CLI de 15/10, Postgres 17.6 com supautils,
-- pgaudit e plpgsql_check) qualquer chamada a função sem EXECUTE derruba o
-- processo do servidor com segfault — reproduzido em 30/10 com uma função de
-- uma linha sem relação com o GLYX. Em produção o comportamento correto (42501)
-- foi observado no pentest de 08/09.
reset role;
do $$
begin
  if has_function_privilege('anon', 'public.ia_dentro_do_teto(jsonb, numeric, numeric)', 'execute') then
    raise exception 'FALHOU: anon pode executar ia_dentro_do_teto';
  end if;
  if not has_function_privilege('authenticated', 'public.ia_dentro_do_teto(jsonb, numeric, numeric)', 'execute') then
    raise exception 'FALHOU: authenticated deveria executar ia_dentro_do_teto';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- A8 — limite de tentativas de convite (só service role)
-- ---------------------------------------------------------------------------
do $$
declare
  papel text;
  fn text;
begin
  foreach papel in array array['anon', 'authenticated'] loop
    foreach fn in array array['public.convite_pode_tentar(text, integer, integer)', 'public.convite_registrar_falha(text)'] loop
      if has_function_privilege(papel, fn, 'execute') then
        raise exception 'FALHOU: % pode executar %', papel, fn;
      end if;
    end loop;
    if has_table_privilege(papel, 'public.convite_tentativas_falhas', 'select') then
      raise exception 'FALHOU: % lê as tentativas de convite', papel;
    end if;
  end loop;
end;
$$;

reset role;
set local role service_role;
do $$
declare
  i int;
begin
  if not public.convite_pode_tentar('chave-teste', 3, 3600) then
    raise exception 'FALHOU: sem falhas deveria poder tentar';
  end if;
  for i in 1..3 loop perform public.convite_registrar_falha('chave-teste'); end loop;
  if public.convite_pode_tentar('chave-teste', 3, 3600) then
    raise exception 'FALHOU: 3 falhas com limite 3 deveriam bloquear';
  end if;
  if not public.convite_pode_tentar('outra-chave', 3, 3600) then
    raise exception 'FALHOU: o bloqueio vazou para outra chave';
  end if;
  raise notice 'A8 convite: 5 cenários aprovados';
end;
$$;

-- ---------------------------------------------------------------------------
-- A1 — sugestão por IA só com consentimento; A14 — fuso validado
-- ---------------------------------------------------------------------------
reset role;
do $$
declare
  d text;
begin
  -- Coluna existe, desligada por padrão.
  if (select ia_sugestao_automatica from public.profiles where id = (select a from ids)) then
    raise exception 'FALHOU: consentimento deveria nascer desligado';
  end if;

  d := pg_get_functiondef('public.dispatch_meal_suggestions()'::regprocedure);
  if position('p.ia_sugestao_automatica' in d) = 0 then
    raise exception 'FALHOU: dispatch_meal_suggestions não filtra por consentimento';
  end if;

  foreach d in array array['dispatch_water_reminder', 'dispatch_meal_suggestions', 'dispatch_sensor_stale_alert'] loop
    if position('glyx_fuso_valido' in pg_get_functiondef(format('public.%I()', d)::regprocedure)) = 0 then
      raise exception 'FALHOU: % não usa glyx_fuso_valido', d;
    end if;
    if position('coalesce(p.timezone' in pg_get_functiondef(format('public.%I()', d)::regprocedure)) > 0 then
      raise exception 'FALHOU: % ainda tem fuso cru', d;
    end if;
  end loop;
end;
$$;

-- Prova de comportamento: um perfil com fuso inválido não derruba os jobs.
update public.profiles set timezone = 'Fuso/Inexistente' where id = (select a from ids);
do $$
begin
  perform public.dispatch_water_reminder();
  perform public.dispatch_meal_suggestions();
  perform public.dispatch_sensor_stale_alert();
  raise notice 'A1/A14 consentimento e fuso: 5 cenários aprovados';
end;
$$;

rollback;
