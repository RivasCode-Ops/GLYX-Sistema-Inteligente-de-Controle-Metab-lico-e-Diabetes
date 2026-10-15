-- Policies de 20261015100000: adiamento e registro só com medicamento próprio.
--
-- RODA SÓ EM BANCO DE TESTE (GLYX-03). Transação desfeita no fim.
--   psql "$URL_DO_BANCO_DE_TESTE" -v ON_ERROR_STOP=1 -f supabase/tests/policies_dono_do_medicamento.sql
--
-- Simula o papel `authenticated` com o `sub` do JWT, que é o que `auth.uid()` lê.
-- Contra as policies antigas, os dois inserts cruzados PASSAM — é o defeito.

begin;

create temp table ids (a uuid, b uuid, med_b uuid) on commit drop;
insert into ids values (gen_random_uuid(), gen_random_uuid(), gen_random_uuid());
grant select on ids to authenticated;

insert into auth.users (id, email) select a, a::text || '@teste.invalid' from ids;
insert into auth.users (id, email) select b, b::text || '@teste.invalid' from ids;
insert into public.profiles (id) select a from ids on conflict (id) do nothing;
insert into public.profiles (id) select b from ids on conflict (id) do nothing;
insert into public.medications (id, user_id, name, kind) select med_b, b, 'Remédio de B', 'med' from ids;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', (select a from ids), 'role', 'authenticated')::text, true);

do $$
declare
  v ids%rowtype;
begin
  select * into v from ids;

  begin
    insert into public.medication_snoozes (user_id, medication_id, snoozed_until, scheduled_for, attempt)
      values (v.a, v.med_b, now() + interval '15 minutes', now(), 1);
    raise exception 'FALHOU: A criou adiamento com remédio de B';
  exception when insufficient_privilege then
    null; -- esperado: 42501, violação de RLS
  end;

  begin
    insert into public.medication_logs (user_id, medication_id, confirmed)
      values (v.a, v.med_b, true);
    raise exception 'FALHOU: A registrou dose de remédio de B';
  exception when insufficient_privilege then
    null;
  end;

  -- Registro sem medicamento (remédio já apagado) continua permitido.
  insert into public.medication_logs (user_id, medication_id, confirmed) values (v.a, null, true);

  raise notice 'policies de dono do medicamento: 3 cenários aprovados';
end;
$$;

rollback;
