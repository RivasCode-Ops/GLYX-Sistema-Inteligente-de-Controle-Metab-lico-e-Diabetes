-- A3 — consultas SOMENTE DE LEITURA antes de implantar o lote 1 (GLYX-39).
--
-- NÃO EXECUTADO. Preparado em 15/10/2026. Rodar só com a autorização A3 do Rivas,
-- pelo SQL Editor do Supabase de produção, um bloco por vez, salvando o resultado
-- FORA do repositório (ex.: d:\tmp\a3-AAAA-MM-DD\).
--
-- Regras deste arquivo:
--   * tudo dentro de transação READ ONLY: qualquer escrita falha em vez de acontecer;
--   * resultados agregados (contagens, presença/ausência, hashes) — nenhum id de
--     usuário, nenhum valor clínico, nenhum nome de remédio;
--   * a única saída com texto longo é a definição da função de alarme (B1b), que é
--     código, não dado — e é o que o script de reversão precisa.
--
-- Fica FORA de supabase/migrations de propósito: nunca é aplicado pela CLI.

begin transaction read only;
set local statement_timeout = '15s';

-- ===========================================================================
-- B0. Conferir o alvo antes de ler qualquer coisa.
--     Finalidade: garantir que é o banco certo e que o histórico de migrations
--     termina onde o código de partida (535e2bc) espera: 72 aplicadas, última
--     20260908180000, nenhuma do lote 1 ainda. As versões de produção são o
--     horário de aplicação (P44), então o lote é procurado pelo NOME.
-- ===========================================================================
select current_database() as banco,
       split_part(current_setting('server_version'), ' ', 1) as postgres,
       (select count(*) from supabase_migrations.schema_migrations) as migrations_aplicadas,
       (select max(version) from supabase_migrations.schema_migrations) as ultima,
       (select count(*) from supabase_migrations.schema_migrations
         where name in ('filhos_de_medications_mesmo_dono', 'medication_logs_dose_unica',
                        'conta_ativa_e_uso_de_ia', 'med_alarms_cadencia_e_confiabilidade')) as do_lote_1_ja_aplicadas;

-- ===========================================================================
-- B1. Definição atual da função de alarme.
--     Finalidade: o script de reversão (supabase/reversao/20261014_reverter_lote1.sql)
--     recria a definição capturada no banco DESCARTÁVEL. Se a de produção diferir,
--     o script tem de ser atualizado ANTES de implantar.
-- ===========================================================================
-- B1a. Resumo para comparar sem copiar o texto: tamanho e hash.
select length(pg_get_functiondef('public.dispatch_med_alarms'::regproc)) as tamanho,
       md5(pg_get_functiondef('public.dispatch_med_alarms'::regproc)) as md5,
       position('app_base_url()' in pg_get_functiondef('public.dispatch_med_alarms'::regproc)) > 0 as usa_app_base_url,
       position('timing_strictness' in pg_get_functiondef('public.dispatch_med_alarms'::regproc)) > 0 as ja_le_rigidez,
       position('cadence' in pg_get_functiondef('public.dispatch_med_alarms'::regproc)) > 0 as ja_le_cadencia;
-- B1b. Texto completo — salvar como arquivo fora do repositório e comparar com
--      d:\tmp\glyx-supabase-teste\dispatch_med_alarms-antiga.sql.
select pg_get_functiondef('public.dispatch_med_alarms'::regproc) as definicao;

-- ===========================================================================
-- B2. Doses duplicadas (bloqueiam o índice de 20261015101000, dose única).
--     Finalidade: a migration PARA de propósito se houver duplicata. Saber antes
--     quantas existem, sem identificar quem.
-- ===========================================================================
select count(*) as grupos_duplicados,
       coalesce(sum(n - 1), 0) as linhas_excedentes,
       coalesce(max(n), 0) as maior_repeticao,
       min(dia) as mais_antiga, max(dia) as mais_recente
from (
  select count(*) as n, min(scheduled_for)::date as dia
  from public.medication_logs
  where confirmed and scheduled_for is not null
  group by user_id, medication_id, scheduled_for
  having count(*) > 1
) d;

-- ===========================================================================
-- B3. Linha de base dos alarmes (para comparar depois da implantação).
--     Finalidade: saber quantos alarmes saem hoje, quantas chamadas do pg_net
--     falham e se os crons estão ativos — o "antes" do gatilho de reversão.
-- ===========================================================================
-- B3a. Registros de despacho por tipo, últimas 24 h e 7 dias.
select kind,
       count(*) filter (where created_at > now() - interval '24 hours') as ult_24h,
       count(*) filter (where created_at > now() - interval '7 days') as ult_7d
from public.push_dispatch_log
where created_at > now() - interval '7 days'
group by kind order by kind;
-- B3b. Respostas HTTP do pg_net por código (o pg_net guarda só algumas horas).
select coalesce(status_code::text, 'sem_resposta') as status, count(*) as respostas,
       min(created) as desde
from net._http_response group by 1 order by 1;
-- B3c. Execuções dos crons nas últimas 24 h, por job e desfecho (sem o comando).
select j.jobname, j.schedule, j.active, d.status, count(d.*) as execucoes
from cron.job j
left join cron.job_run_details d
  on d.jobid = j.jobid and d.start_time > now() - interval '24 hours'
group by 1, 2, 3, 4 order by 1, 4;

-- ===========================================================================
-- B4. Compatibilidade do schema com as quatro migrations.
--     Finalidade: cada linha "falta"/"conflito" é motivo para parar antes de
--     aplicar. Resultado esperado: nenhuma linha em B4a–B4d.
-- ===========================================================================
-- B4a. Tabelas e colunas que as migrations leem ou alteram — lista só o que FALTA.
with esperado(tabela, coluna) as (values
  ('medications','reminder_times'),('medications','timing_strictness'),('medications','cadence'),
  ('medications','cadence_weekday'),('medications','cadence_interval_days'),('medications','cadence_anchor_on'),
  ('medications','stock_units'),('medications','stock_updated_on'),('medications','user_id'),
  ('profiles','disabled'),('profiles','timezone'),
  ('medication_logs','confirmed'),('medication_logs','scheduled_for'),('medication_logs','medication_id'),
  ('medication_snoozes','medication_id'),('medication_snoozes','scheduled_for'),
  ('push_dispatch_log','kind'),('push_dispatch_log','ref'),('push_dispatch_log','sent_on'),
  ('ai_usage','prompt_tokens'),('ai_usage','completion_tokens'),('ai_usage','model'),
  ('push_subscriptions','endpoint')
), contas(tabela) as (select unnest(array[
  'ai_messages','ai_threads','ai_usage','blood_pressure_logs','body_goals','body_measurements','body_photos',
  'cgm_connections','exam_values','exams','exercise_sessions','glucose_readings','google_fit_connections',
  'health_events','health_snapshots','hypo_events','hypo_plan','insight_findings','insulin_logs','meals',
  'medication_logs','medication_snoozes','medications','metabolic_alerts','metabolic_audits','muscle_pauses',
  'push_dispatch_log','push_subscriptions','strength_logs','user_substance_windows','water_logs','weight_logs']))
select 'coluna' as tipo, e.tabela || '.' || e.coluna as falta from esperado e
where not exists (select 1 from information_schema.columns c
                  where c.table_schema = 'public' and c.table_name = e.tabela and c.column_name = e.coluna)
union all
select 'tabela da policy conta_ativa', c.tabela || '.user_id' from contas c
where not exists (select 1 from information_schema.columns k
                  where k.table_schema = 'public' and k.table_name = c.tabela and k.column_name = 'user_id')
union all
-- tabela com user_id que existe em produção e NÃO está na lista (ficaria sem a policy)
select 'tabela com user_id fora da lista', k.table_name from information_schema.columns k
where k.table_schema = 'public' and k.column_name = 'user_id'
  and k.table_name not in (select tabela from contas)
  and k.table_name in (select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE');

-- B4b. Colunas novas de push_dispatch_log que JÁ existam (com tipo diferente, o
--      "add column if not exists" pularia e a função nova quebraria).
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'push_dispatch_log'
  and column_name in ('status','attempts','last_attempt_at','confirmed_at','last_error','scheduled_at','payload');

-- B4c. Objetos que o lote CRIA e já existiriam (sinal de aplicação parcial) e
--      objetos de que ele DEPENDE e faltariam.
select 'não deveria existir' as situacao, x.nome from (values
  ('consumir_cota_ia'),('registrar_tokens_ia'),('apagar_meu_uso_de_ia'),('conta_ativa'),
  ('med_alarms_due'),('med_alarm_is_dose_day'),('glyx_fuso_valido')) x(nome)
where exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = x.nome)
union all
select 'não deveria existir', 'índice medication_logs_dose_confirmada_unica'
where to_regclass('public.medication_logs_dose_confirmada_unica') is not null
union all
select 'falta', x.nome from (values
  ('public.app_base_url()'),('public.record_system_ai_usage(uuid,text,integer,integer,text,text)'),
  ('public.dispatch_med_alarms()')) x(nome)
where to_regprocedure(x.nome) is null
union all
select 'falta', 'extensão ' || x.nome from (values ('pg_net'),('pg_cron'),('supabase_vault')) x(nome)
where not exists (select 1 from pg_extension e where e.extname = x.nome)
union all
select 'falta', 'segredo no Vault: ' || x.nome from (values ('cgm_cron_secret'),('app_base_url')) x(nome)
where not exists (select 1 from vault.secrets s where s.name = x.nome)
union all
select 'falta', 'bucket ' || x.nome from (values ('meal-photos'),('medication-labels'),('body-photos')) x(nome)
where not exists (select 1 from storage.buckets b where b.id = x.nome);

-- B4d. Policies atuais nas tabelas que o lote reescreve (nomes e tipo, sem o SQL).
select tablename, policyname, cmd, permissive
from pg_policies
where schemaname = 'public' and tablename in ('medication_snoozes','medication_logs','ai_usage')
order by 1, 2;

-- B4e. Dados que a função nova trata de forma diferente (contagens).
select
  (select count(*) from public.profiles
     where timezone is not null and timezone not in (select name from pg_timezone_names)) as fusos_invalidos,
  (select count(*) from public.medications m, unnest(m.reminder_times) t
     where t !~ '^([01]?[0-9]|2[0-3]):[0-5][0-9]$') as horarios_malformados;

-- ===========================================================================
-- B5. Quem cada decisão afeta HOJE (contagens, para D1–D4).
-- ===========================================================================
select coalesce(cadence, '(vazia)') as frequencia,
       coalesce(timing_strictness, '(vazia)') as rigidez,
       count(*) as remedios_ativos_com_horario
from public.medications
where active and reminder_times is not null and cardinality(reminder_times) > 0
group by 1, 2 order by 1, 2;
select count(*) filter (where created_at > now() - interval '1 hour') as uso_ia_ult_1h,
       count(*) filter (where created_at > now() - interval '24 hours') as uso_ia_ult_24h,
       count(distinct user_id) filter (where created_at > now() - interval '24 hours') as contas_com_uso_24h
from public.ai_usage;

-- ===========================================================================
-- B6. P06 — o envio automático de glicemia está ativo?
--     Finalidade: saber se o cron de sugestão roda e quantas sugestões saíram,
--     antes de decidir D5. (O custo em ai_usage ficou subcontado desde 08/09;
--     push_dispatch_log é a contagem confiável.)
-- ===========================================================================
select jobname, schedule, active from cron.job where jobname = 'glyx-meal-suggest';
select sent_on as dia, count(*) as sugestoes
from public.push_dispatch_log
where kind = 'meal_suggest' and sent_on > current_date - 14
group by 1 order by 1;

rollback;
