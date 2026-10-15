-- Dose única PROSPECTIVA, identidade da ação e correção rastreável.
--
-- NÃO APLICADA. Criada em 14/10/2026; reescrita em 15/10/2026 depois da leitura
-- A3 e da decisão de direção D14 (opção B): preservar o histórico e proteger só
-- o que for criado a partir da implantação. Tarefas GLYX-11 e P45.
--
-- O que mudou em relação à versão de 14/10: aquela criava o índice sobre TODO o
-- histórico e falharia em produção (11 grupos de doses repetidas entre 08/09 e
-- 03/10, nenhum apagado — docs/D14-DOSES-DUPLICADAS.md).
--
-- Três operações que o app distingue (lib/medications/register-dose.ts):
--   reenvio da mesma ação  -> `client_request_id` igual: não cria outra linha;
--   correção de uma tomada -> UPDATE; o valor anterior vai para `correcoes`;
--   outra tomada           -> linha nova, rótulo `adicional`, sem dose prevista.
--
-- Ordem de implantação: o CÓDIGO antes desta migration. O código novo funciona
-- sem ela (não guarda o pedido e recusa correção, explicitamente); o código
-- antigo com ela recusa o segundo registro na mesma dose sem avisar.

-- 1. Colunas -----------------------------------------------------------------
-- Identidade da ação (UUID gerado quando a tela ou a notificação aparece).
alter table public.medication_logs add column if not exists client_request_id uuid;
-- Pedido que fez a última correção (idempotência da correção).
alter table public.medication_logs add column if not exists correcao_pedido uuid;
-- Histórico de correções, preenchido SÓ pelo gatilho abaixo.
alter table public.medication_logs add column if not exists correcoes jsonb not null default '[]'::jsonb;

comment on column public.medication_logs.client_request_id is
  'Identidade da ação de registro. Reenvio com o mesmo valor não cria outra tomada (índice medication_logs_pedido_unico).';
comment on column public.medication_logs.correcoes is
  'Valores anteriores de cada correção (instante, dose prevista, rótulo, confirmação), com data, autor (auth.uid(), nulo sem usuário autenticado), papel e pedido. Preenchido pelo gatilho; o cliente não escreve.';

-- 2. Rótulo `adicional` -------------------------------------------------------
-- O CHECK de 20260907131000 foi criado sem nome; o Postgres o chama assim.
alter table public.medication_logs drop constraint if exists medication_logs_adherence_status_check;
alter table public.medication_logs add constraint medication_logs_adherence_status_check
  check (adherence_status in ('no_horario', 'atrasado', 'fora_janela', 'avulso', 'adicional'));

-- 3. Gatilho: created_at do servidor e correção com histórico ------------------
-- `created_at` decide quem entra no índice prospectivo; se o cliente pudesse
-- mandá-lo (o PostgREST aceita qualquer coluna no insert), bastaria enviar uma
-- data antiga para escapar da proteção. Aqui ele é sempre o relógio do banco.
create or replace function public.medication_logs_protege_historico()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
    new.correcoes := '[]'::jsonb;
    new.correcao_pedido := null;
    return new;
  end if;

  -- UPDATE: o que identifica a linha não muda. `medication_id` fica livre de
  -- propósito: apagar o medicamento o anula (on delete set null).
  new.created_at := old.created_at;
  new.client_request_id := old.client_request_id;
  new.user_id := old.user_id;

  if (new.taken_at, new.scheduled_for, new.adherence_status, new.confirmed)
     is distinct from (old.taken_at, old.scheduled_for, old.adherence_status, old.confirmed) then
    -- AUTOR (D15): vem da identidade que o PostgREST validou (claims do JWT
    -- assinado, em `request.jwt.*`), nunca de coluna enviada pelo cliente.
    -- Sem usuário autenticado (chave de serviço, migração, superusuário),
    -- `por` fica NULO — não se inventa autor — e `papel` diz quem fez.
    -- Entradas anteriores a esta regra não recebem autor.
    new.correcoes := old.correcoes || jsonb_build_array(jsonb_build_object(
      'em', now(),
      'por', auth.uid(),
      'papel', coalesce(
        nullif(current_setting('request.jwt.claim.role', true), ''),
        (nullif(current_setting('request.jwt.claims', true), '')::jsonb) ->> 'role',
        current_user
      ),
      'pedido', new.correcao_pedido,
      'taken_at_anterior', old.taken_at,
      'scheduled_for_anterior', old.scheduled_for,
      'rotulo_anterior', old.adherence_status,
      'confirmed_anterior', old.confirmed
    ));
  else
    -- Sem mudança no registro, o histórico e o pedido não mudam.
    new.correcoes := old.correcoes;
    new.correcao_pedido := old.correcao_pedido;
  end if;
  return new;
end;
$$;

revoke all on function public.medication_logs_protege_historico() from public, anon, authenticated;

drop trigger if exists medication_logs_protege_historico on public.medication_logs;
create trigger medication_logs_protege_historico
  before insert or update on public.medication_logs
  for each row execute function public.medication_logs_protege_historico();

-- 4. Reenvio da mesma ação ----------------------------------------------------
-- Vale para toda linha nova (as antigas têm o campo nulo e ficam de fora).
create unique index if not exists medication_logs_pedido_unico
  on public.medication_logs (user_id, client_request_id)
  where client_request_id is not null;

-- 5. Uma tomada confirmada por dose prevista — SÓ para o que for criado a partir
--    da data de corte. O histórico anterior fica como está (D14, opção B).
--
-- A DATA DE CORTE NÃO ESTÁ NESTE ARQUIVO. Ela é um parâmetro da sessão que
-- aplica a migration, na MESMA transação, antes do arquivo:
--
--   select set_config('glyx.corte_dose_unica', '2026-10-20T15:00:00Z', true);
--
-- Assim o arquivo aplicado é idêntico ao do commit (mesmo hash), o teste que
-- exige a falha sem corte continua valendo, e o corte usado fica registrado no
-- próprio índice (definição e comentário). Recomendado: logo DEPOIS de o código
-- novo estar no ar (plano §4). Sem o parâmetro — ou com valor sem fuso, ilegível
-- ou fora do intervalo esperado — esta migration para antes de criar o índice,
-- e a transação inteira é desfeita.
do $$
declare
  corte text := nullif(btrim(current_setting('glyx.corte_dose_unica', true)), '');
  corte_ts timestamptz;
  n int;
begin
  if corte is null then
    raise exception 'Data de corte da dose única não configurada. Na mesma transação, antes deste arquivo: select set_config(''glyx.corte_dose_unica'', ''<instante ISO com fuso>'', true); (docs/PLANO-IMPLEMENTACAO.md, D14).';
  end if;
  -- Fuso explícito obrigatório: sem ele o instante dependeria do fuso da sessão.
  if corte !~ '(Z|[+-][0-9]{2}(:?[0-9]{2})?)$' then
    raise exception 'Data de corte "%" sem fuso explícito (use, por exemplo, 2026-10-20T15:00:00Z).', corte;
  end if;
  begin
    corte_ts := corte::timestamptz;
  exception when others then
    raise exception 'Data de corte "%" ilegível.', corte;
  end;
  if corte_ts < timestamptz '2026-10-15' or corte_ts > now() + interval '1 day' then
    raise exception 'Data de corte % fora do intervalo esperado (a partir de 15/10/2026 e até amanhã).', corte_ts;
  end if;

  -- Repetição criada DEPOIS do corte impede o índice: falha com mensagem.
  select count(*) into n
  from (
    select 1
    from public.medication_logs
    where confirmed and scheduled_for is not null and created_at >= corte_ts
    group by user_id, medication_id, scheduled_for
    having count(*) > 1
  ) d;
  if n > 0 then
    raise exception
      'medication_logs tem % dose(s) prevista(s) confirmada(s) mais de uma vez depois do corte %. Revise antes de criar o índice.', n, corte_ts;
  end if;

  -- Reexecutável: recria com o corte desta aplicação.
  drop index if exists public.medication_logs_dose_confirmada_unica;
  execute format(
    'create unique index medication_logs_dose_confirmada_unica
       on public.medication_logs (user_id, medication_id, scheduled_for)
       where confirmed and scheduled_for is not null and created_at >= %L::timestamptz',
    corte_ts
  );
  -- Rastro no banco: qual corte foi usado e quando a migration rodou.
  execute format(
    'comment on index public.medication_logs_dose_confirmada_unica is %L',
    format('dose única (migration 20261015101000): corte %s, aplicada em %s', corte_ts, now())
  );
end;
$$;
