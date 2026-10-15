-- Teste SQL da migration 20261015101000 (dose única prospectiva, pedido, correção).
--
-- Executado em PostgreSQL 14 isolado (WSL) em 15/10/2026 — ver docs/D14-DOSES-DUPLICADAS.md §7.
-- Rodar DEPOIS de aplicar a migration num banco DESCARTÁVEL, com a data de corte
-- de teste passada como parâmetro na mesma transação (ex.: o instante da
-- aplicação): select set_config('glyx.corte_dose_unica', '<ISO com fuso>', true);
-- Tudo numa transação desfeita; só dados sintéticos.
--
--   psql "$URL_TESTE" -v ON_ERROR_STOP=1 -f supabase/tests/dose_unica_prospectiva.sql
--
-- A CONCORRÊNCIA entre sessões não cabe numa transação só: ver o roteiro em
-- docs/D14-DOSES-DUPLICADAS.md §6 (duas sessões psql, ou pgbench).

begin;

do $$
declare
  u uuid := gen_random_uuid();
  m uuid := gen_random_uuid();
  dose timestamptz := date_trunc('hour', now()) - interval '2 hours';
  l1 uuid;
  n int;
  ok boolean;
  hist jsonb;
begin
  insert into auth.users (id, email) values (u, u::text || '@teste.invalid');
  insert into public.medications (id, user_id, name, reminder_times) values (m, u, 'Remédio sintético', array['08:00']);

  -- 1. created_at enviado pelo cliente é ignorado (não dá para fugir do corte).
  insert into public.medication_logs (user_id, medication_id, taken_at, confirmed, scheduled_for, adherence_status, created_at, client_request_id)
    values (u, m, dose, true, dose, 'no_horario', '2020-01-01', gen_random_uuid())
    returning id into l1;
  select created_at > now() - interval '1 minute' into ok from public.medication_logs where id = l1;
  if not ok then raise exception 'FALHOU: created_at do cliente foi aceito'; end if;

  -- 2. Segunda tomada confirmada na mesma dose, criada depois do corte: recusada.
  begin
    insert into public.medication_logs (user_id, medication_id, taken_at, confirmed, scheduled_for, adherence_status)
      values (u, m, dose + interval '5 hours', true, dose, 'atrasado');
    raise exception 'FALHOU: segunda tomada na mesma dose foi aceita';
  exception when unique_violation then null;
  end;

  -- 3. Outra tomada (sem dose prevista, rótulo adicional): aceita.
  insert into public.medication_logs (user_id, medication_id, taken_at, confirmed, scheduled_for, adherence_status)
    values (u, m, dose + interval '5 hours', true, null, 'adicional');

  -- 4. Mesmo pedido duas vezes: recusado pelo índice do pedido.
  begin
    insert into public.medication_logs (user_id, medication_id, taken_at, confirmed, client_request_id)
      select user_id, medication_id, taken_at, confirmed, client_request_id from public.medication_logs where id = l1;
    raise exception 'FALHOU: mesmo pedido aceito duas vezes';
  exception when unique_violation then null;
  end;

  -- 5. Correção: o valor anterior vai para `correcoes`; created_at e pedido não mudam.
  update public.medication_logs
    set taken_at = dose + interval '30 minutes', adherence_status = 'atrasado', correcao_pedido = gen_random_uuid()
    where id = l1;
  select correcoes into hist from public.medication_logs where id = l1;
  if jsonb_array_length(hist) <> 1 or (hist->0->>'taken_at_anterior')::timestamptz <> dose then
    raise exception 'FALHOU: correção sem histórico do valor anterior: %', hist;
  end if;
  -- D15: sem usuário autenticado (aqui, superusuário), autor NULO e papel registrado.
  if hist->0->'por' <> 'null'::jsonb or hist->0->>'papel' is distinct from current_user::text then
    raise exception 'FALHOU: autor inventado ou papel ausente sem identidade: %', hist->0;
  end if;

  -- 6. Escrever o histórico direto não tem efeito.
  update public.medication_logs set correcoes = '[]'::jsonb where id = l1;
  select jsonb_array_length(correcoes) into n from public.medication_logs where id = l1;
  if n <> 1 then raise exception 'FALHOU: o cliente apagou o histórico de correção'; end if;

  -- 6b. D15: correção feita pelo PRÓPRIO usuário autenticado registra ele como autor.
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', u::text, true);
  update public.medication_logs set taken_at = dose + interval '45 minutes', correcao_pedido = gen_random_uuid() where id = l1;
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', '', true);
  select correcoes into hist from public.medication_logs where id = l1;
  if (hist->1->>'por')::uuid is distinct from u or hist->1->>'papel' <> 'authenticated' then
    raise exception 'FALHOU: autor da correção não é o usuário autenticado: %', hist->1;
  end if;

  -- 7. Linha ANTERIOR ao corte (simulada desligando o gatilho, só dentro deste teste)
  --    não entra no índice: duas antigas na mesma dose convivem.
  alter table public.medication_logs disable trigger medication_logs_protege_historico;
  insert into public.medication_logs (user_id, medication_id, taken_at, confirmed, scheduled_for, adherence_status, created_at)
    values (u, m, dose - interval '1 day', true, dose - interval '1 day', 'no_horario', '2026-09-08'),
           (u, m, dose - interval '1 day', true, dose - interval '1 day', 'no_horario', '2026-09-08');
  alter table public.medication_logs enable trigger medication_logs_protege_historico;

  -- 8. Apagar o medicamento continua anulando medication_id (on delete set null).
  delete from public.medications where id = m;
  select count(*) into n from public.medication_logs where user_id = u and medication_id is not null;
  if n <> 0 then raise exception 'FALHOU: medication_id não foi anulado ao apagar o medicamento'; end if;

  raise notice 'dose_unica_prospectiva: 9 cenários OK (inclui autor da correção, D15)';
end;
$$;

rollback;
