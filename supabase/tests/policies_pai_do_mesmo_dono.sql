-- Policies de 20261030130000: valor de exame, evento e mensagem só com pai próprio.
--
-- RODA SÓ EM BANCO DE TESTE (GLYX-03). Transação desfeita no fim.
--   psql "$URL_DO_BANCO_DE_TESTE" -v ON_ERROR_STOP=1 -f supabase/tests/policies_pai_do_mesmo_dono.sql
--
-- Contra as policies antigas, os três inserts cruzados PASSAM — é o defeito (GLYX-44).

begin;

create temp table ids (a uuid, b uuid, exame_b uuid, med_b uuid, conversa_b uuid, exame_a uuid, conversa_a uuid) on commit drop;
insert into ids values (gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(),
                        gen_random_uuid(), gen_random_uuid(), gen_random_uuid());
grant select on ids to authenticated;

insert into auth.users (id, email) select a, a::text || '@teste.invalid' from ids;
insert into auth.users (id, email) select b, b::text || '@teste.invalid' from ids;
insert into public.profiles (id) select a from ids on conflict (id) do nothing;
insert into public.profiles (id) select b from ids on conflict (id) do nothing;
insert into public.exams (id, user_id, title) select exame_b, b, 'Exame de B' from ids;
insert into public.exams (id, user_id, title) select exame_a, a, 'Exame de A' from ids;
insert into public.medications (id, user_id, name, kind) select med_b, b, 'Remédio de B', 'med' from ids;
insert into public.ai_threads (id, user_id) select conversa_b, b from ids;
insert into public.ai_threads (id, user_id) select conversa_a, a from ids;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', (select a from ids), 'role', 'authenticated')::text, true);

do $$
declare
  v ids%rowtype;
begin
  select * into v from ids;

  begin
    insert into public.exam_values (exam_id, user_id, analyte, label, value_num)
      values (v.exame_b, v.a, 'hba1c', 'HbA1c', 7.0);
    raise exception 'FALHOU: A gravou valor no exame de B';
  exception when insufficient_privilege then
    null;
  end;

  begin
    insert into public.health_events (user_id, medication_id, kind, label, occurred_on)
      values (v.a, v.med_b, 'medicacao_inicio', 'teste', current_date);
    raise exception 'FALHOU: A ligou evento ao remédio de B';
  exception when insufficient_privilege then
    null;
  end;

  begin
    insert into public.ai_messages (thread_id, user_id, role, content, seq)
      values (v.conversa_b, v.a, 'user', 'oi', 1);
    raise exception 'FALHOU: A escreveu na conversa de B';
  exception when insufficient_privilege then
    null;
  end;

  -- Caminhos legítimos continuam abertos.
  insert into public.exam_values (exam_id, user_id, analyte, label, value_num)
    values (v.exame_a, v.a, 'hba1c', 'HbA1c', 7.0);
  insert into public.health_events (user_id, medication_id, kind, label, occurred_on)
    values (v.a, null, 'outro', 'teste', current_date);
  insert into public.ai_messages (thread_id, user_id, role, content, seq)
    values (v.conversa_a, v.a, 'user', 'oi', 1);

  raise notice 'policies de pai do mesmo dono: 6 cenários aprovados';
end;
$$;

rollback;
