-- Conta desativada barrada no banco, e uso de IA que o usuário não apaga.
--
-- NÃO APLICADA. Criada em 14/10/2026 como arquivo. Tarefas GLYX-23 e GLYX-24.
--
-- ===========================================================================
-- PARTE 1 — Conta desativada (GLYX-23)
-- ===========================================================================
-- O bloqueio existia só no middleware do Next. Com o próprio token e a chave
-- anon (pública), uma conta desativada continuava lendo e gravando tudo direto
-- no PostgREST e no Storage. Nenhuma policy olhava `profiles.disabled`.
--
-- A correção são policies RESTRITIVAS: o Postgres exige que TODA restritiva
-- passe, além de alguma permissiva. As policies de dono continuam iguais; esta
-- só acrescenta "e a conta está ativa". Vale para o token que já foi emitido —
-- coisa que banir no Auth não faz: o banimento (feito pela action do admin)
-- impede login e refresh, mas o token em mãos continua válido até expirar.
-- As duas medidas juntas fecham as três portas: token atual, refresh e login.
--
-- `profiles` fica DE FORA de propósito: o middleware lê `disabled` com o cliente
-- do próprio usuário. Se a restritiva escondesse o perfil, o middleware leria
-- nulo e LIBERARIA a conta. O perfil não tem dado clínico além do que a
-- exclusão LGPD limpa.
--
-- `(select public.conta_ativa())` entre parênteses vira initPlan: avaliado uma
-- vez por consulta, não uma vez por linha.

create or replace function public.conta_ativa()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  -- Sem perfil (não deveria acontecer: o trigger cria no cadastro) vale ativa,
  -- para não trancar a conta por ausência de linha.
  select coalesce(
    (select not p.disabled from public.profiles p where p.id = auth.uid()),
    true
  );
$$;

comment on function public.conta_ativa() is
  'Usada nas policies restritivas conta_ativa. Precisa ser executável por authenticated, como is_current_user_admin.';

revoke all on function public.conta_ativa() from public, anon;
grant execute on function public.conta_ativa() to authenticated;

-- Toda tabela com user_id. Um teste (lib/db/acesso-migration.test.ts) extrai
-- do schema as tabelas com user_id e reprova se alguma faltar aqui.
do $$
declare
  t text;
begin
  foreach t in array array[
    'ai_messages', 'ai_threads', 'ai_usage', 'blood_pressure_logs', 'body_goals',
    'body_measurements', 'body_photos', 'cgm_connections', 'exam_values', 'exams',
    'exercise_sessions', 'glucose_readings', 'google_fit_connections', 'health_events',
    'health_snapshots', 'hypo_events', 'hypo_plan', 'insight_findings', 'insulin_logs',
    'meals', 'medication_logs', 'medication_snoozes', 'medications', 'metabolic_alerts',
    'metabolic_audits', 'muscle_pauses', 'push_dispatch_log', 'push_subscriptions',
    'strength_logs', 'user_substance_windows', 'water_logs', 'weight_logs'
  ]
  loop
    execute format('drop policy if exists conta_ativa on public.%I', t);
    execute format(
      'create policy conta_ativa on public.%I as restrictive for all to authenticated '
      'using ((select public.conta_ativa())) with check ((select public.conta_ativa()))',
      t
    );
  end loop;
end;
$$;

-- Storage: só os buckets do app. Outros buckets (se um dia existirem) não são
-- afetados por esta regra.
drop policy if exists "glyx_conta_ativa_fotos" on storage.objects;
create policy "glyx_conta_ativa_fotos"
  on storage.objects
  as restrictive
  for all
  to authenticated
  using (
    bucket_id not in ('meal-photos', 'medication-labels', 'body-photos')
    or (select public.conta_ativa())
  )
  with check (
    bucket_id not in ('meal-photos', 'medication-labels', 'body-photos')
    or (select public.conta_ativa())
  );

-- ===========================================================================
-- PARTE 2 — Uso de IA (GLYX-24)
-- ===========================================================================
-- A policy `ai_usage_own` era `for all`: o usuário apagava as próprias linhas
-- pelo PostgREST e zerava o limite por hora (e falseava o painel de custo).
-- Além disso, contar e depois inserir não é atômico: requisições em paralelo
-- passavam do limite.
--
-- Agora: o usuário só LÊ. Gravar uso passa por RPC com trava por usuário e
-- tipo (`pg_advisory_xact_lock`), que conta e insere na mesma transação.

drop policy if exists "ai_usage_own" on public.ai_usage;
drop policy if exists "ai_usage_select_own" on public.ai_usage;
create policy "ai_usage_select_own"
  on public.ai_usage for select
  to authenticated
  using (auth.uid() = user_id);

-- Consome uma unidade da cota, ou recusa. Os limites vêm do servidor do app;
-- chamar esta RPC direto, com limite inventado, só registra uso na própria
-- conta — não dá acesso a modelo nenhum.
create or replace function public.consumir_cota_ia(
  p_kind text,
  p_limite integer,
  p_janela_segundos integer
)
returns table (permitido boolean, usados integer, usage_id uuid, mais_antigo timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  n integer;
  novo uuid;
  antigo timestamptz;
begin
  if uid is null then
    raise exception 'sem sessão' using errcode = '42501';
  end if;
  if p_limite is null or p_limite < 1 or p_limite > 1000
     or p_janela_segundos is null or p_janela_segundos < 60 or p_janela_segundos > 2678400 then
    raise exception 'parâmetros de cota inválidos' using errcode = '22023';
  end if;

  -- Serializa as chamadas do MESMO usuário e tipo até o fim da transação.
  perform pg_advisory_xact_lock(hashtextextended(uid::text || ':' || p_kind, 0));

  select count(*), min(created_at) into n, antigo
    from public.ai_usage
    where user_id = uid
      and kind = p_kind
      and created_at > now() - make_interval(secs => p_janela_segundos);

  if n >= p_limite then
    return query select false, n, null::uuid, antigo;
    return;
  end if;

  insert into public.ai_usage (user_id, kind) values (uid, p_kind) returning id into novo;
  return query select true, n + 1, novo, antigo;
end;
$$;

-- Tokens reportados pelo provedor, gravados uma vez, só em linha própria.
create or replace function public.registrar_tokens_ia(
  p_usage_id uuid,
  p_prompt integer,
  p_completion integer,
  p_model text
)
returns void
language sql
security definer
set search_path = public
as $$
  update public.ai_usage
    set prompt_tokens = p_prompt,
        completion_tokens = p_completion,
        model = left(p_model, 120)
    where id = p_usage_id
      and user_id = auth.uid()
      and prompt_tokens is null
      and completion_tokens is null;
$$;

-- Exclusão LGPD do histórico de uso (D4, aprovada em 15/10/2026): na exclusão
-- dos dados, o histórico individual de `ai_usage` sai INTEIRO. Quem faz isso é
-- o servidor do app, com a chave de serviço, DENTRO de "apagar todos os meus
-- dados" — não há RPC para o usuário: uma RPC chamável à parte deixaria zerar a
-- cota por hora sem apagar mais nada. Consequência aceita na D4: a exclusão
-- completa reinicia a cota individual. Versões anteriores deste arquivo criavam
-- `apagar_meu_uso_de_ia()` (mantinha 24 h); ela nunca foi aplicada e sai aqui.
drop function if exists public.apagar_meu_uso_de_ia();

revoke all on function public.consumir_cota_ia(text, integer, integer) from public, anon;
revoke all on function public.registrar_tokens_ia(uuid, integer, integer, text) from public, anon;
grant execute on function public.consumir_cota_ia(text, integer, integer) to authenticated;
grant execute on function public.registrar_tokens_ia(uuid, integer, integer, text) to authenticated;

-- O cron de sugestão de refeição passa a registrar o custo com service role
-- (GLYX-25). A migration 20260908180000 revogou anon e afirmou que service_role
-- mantinha EXECUTE; o grant explícito garante, sem depender do privilégio
-- padrão do projeto.
grant execute on function public.record_system_ai_usage(uuid, text, integer, integer, text, text) to service_role;
