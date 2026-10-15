-- Policies e RPCs de 20261015102000 (GLYX-23, GLYX-24).
--
-- RODA SÓ EM BANCO DE TESTE (GLYX-03). Transação desfeita no fim.
--   psql "$URL_DO_BANCO_DE_TESTE" -v ON_ERROR_STOP=1 -f supabase/tests/conta_ativa_e_ai_usage.sql
--
-- Simula o papel `authenticated` com o `sub` do JWT — é o equivalente, no
-- banco, a usar um TOKEN JÁ EMITIDO: a policy vale para ele.
--
-- O que este arquivo NÃO cobre (exige a API de Auth, teste E2E em GLYX-05):
--   - refresh de token recusado depois do banimento;
--   - login recusado depois do banimento;
--   - upload/download no Storage pela API (a policy de storage.objects é
--     conferida aqui só por leitura direta da tabela).

begin;

create temp table ids (ativo uuid, inativo uuid) on commit drop;
insert into ids values (gen_random_uuid(), gen_random_uuid());
grant select on ids to authenticated, service_role;

insert into auth.users (id, email) select ativo, ativo::text || '@teste.invalid' from ids;
insert into auth.users (id, email) select inativo, inativo::text || '@teste.invalid' from ids;
insert into public.profiles (id) select ativo from ids on conflict (id) do nothing;
insert into public.profiles (id) select inativo from ids on conflict (id) do nothing;
update public.profiles set disabled = true where id = (select inativo from ids);
insert into public.glucose_readings (user_id, value_mg_dl) select inativo, 110 from ids;
insert into public.glucose_readings (user_id, value_mg_dl) select ativo, 120 from ids;

-- ---------------------------------------------------------------------------
-- Conta desativada, com token em mãos
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', (select inativo from ids), 'role', 'authenticated')::text, true);

do $$
declare
  n int;
begin
  select count(*) into n from public.glucose_readings;
  if n <> 0 then raise exception 'FALHOU: conta desativada leu % leitura(s)', n; end if;

  begin
    insert into public.glucose_readings (user_id, value_mg_dl)
      values ((select inativo from ids), 130);
    raise exception 'FALHOU: conta desativada gravou leitura';
  exception when insufficient_privilege then null;
  end;

  -- O próprio perfil continua legível: é por ele que o middleware descobre
  -- que a conta está desativada.
  select count(*) into n from public.profiles where id = (select inativo from ids) and disabled;
  if n <> 1 then raise exception 'FALHOU: conta desativada não lê o próprio perfil (middleware liberaria)'; end if;

  select count(*) into n from storage.objects where bucket_id in ('meal-photos', 'medication-labels', 'body-photos');
  if n <> 0 then raise exception 'FALHOU: conta desativada enxerga % objeto(s) do Storage', n; end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Conta ativa: nada muda para ela
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', json_build_object('sub', (select ativo from ids), 'role', 'authenticated')::text, true);

do $$
declare
  n int;
  r record;
begin
  select count(*) into n from public.glucose_readings;
  if n <> 1 then raise exception 'FALHOU: conta ativa deveria ler 1 leitura própria, leu %', n; end if;

  -- ai_usage: não apaga, não insere direto, consome pela RPC.
  begin
    insert into public.ai_usage (user_id, kind) values ((select ativo from ids), 'chat');
    raise exception 'FALHOU: usuário inseriu em ai_usage direto';
  exception when insufficient_privilege then null;
  end;

  select * into r from public.consumir_cota_ia('chat', 2, 3600);
  if not r.permitido then raise exception 'FALHOU: 1ª chamada recusada'; end if;
  select * into r from public.consumir_cota_ia('chat', 2, 3600);
  if not r.permitido then raise exception 'FALHOU: 2ª chamada recusada'; end if;
  select * into r from public.consumir_cota_ia('chat', 2, 3600);
  if r.permitido then raise exception 'FALHOU: 3ª chamada passou do limite 2'; end if;

  delete from public.ai_usage where user_id = (select ativo from ids);
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALHOU: usuário apagou % linha(s) de ai_usage e zerou o limite', n; end if;

  -- D4 (15/10): não existe função de exclusão de uso chamável pelo usuário —
  -- com ela, zerar a cota não exigiria apagar mais nada.
  select count(*) into n from pg_proc where proname = 'apagar_meu_uso_de_ia';
  if n <> 0 then raise exception 'FALHOU: apagar_meu_uso_de_ia existe (cota zerável à parte)'; end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- D4: "apagar todos os meus dados" apaga TODO o histórico de uso de IA. Quem
-- apaga é o servidor do app (chave de serviço), dentro da exclusão completa.
-- Consequência aceita e testada: a cota individual reinicia; e o medidor de
-- gasto do painel admin (soma de ai_usage) deixa de contar essas chamadas.
-- ---------------------------------------------------------------------------
set local role service_role;
do $$
declare n int;
begin
  select count(*) into n from public.ai_usage where user_id = (select ativo from ids);
  if n <> 2 then raise exception 'FALHOU: esperava 2 usos registrados antes da exclusão, há %', n; end if;
  delete from public.ai_usage where user_id = (select ativo from ids);
  select count(*) into n from public.ai_usage where user_id = (select ativo from ids);
  if n <> 0 then raise exception 'FALHOU: sobrou % uso(s) depois da exclusão', n; end if;
end;
$$;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', (select ativo from ids), 'role', 'authenticated')::text, true);
do $$
declare r record;
begin
  select * into r from public.consumir_cota_ia('chat', 2, 3600);
  if not r.permitido then raise exception 'FALHOU: depois da exclusão a cota deveria reiniciar (D4)'; end if;
  raise notice 'conta ativa e ai_usage: cenários aprovados (D4: exclusão reinicia a cota)';
end;
$$;

rollback;
