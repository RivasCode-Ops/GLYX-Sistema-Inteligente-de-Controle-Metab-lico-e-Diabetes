-- Teto global de gasto de IA que BLOQUEIA, não só mostra.
--
-- NÃO APLICADA. Criada em 30/10/2026. Programa da IA gestora, Etapa 1 (C7;
-- problema P52; valores dos tetos ainda dependem de decisão do proprietário).
--
-- O que havia: `AI_DAILY_BUDGET_USD`/`AI_MONTHLY_BUDGET_USD` alimentavam só um
-- medidor no /admin. Nenhuma rota consultava o orçamento antes de chamar o
-- modelo, e o job de sugestão nem tinha cota por usuário.
--
-- Esta função responde uma pergunta só — "o gasto estimado de hoje e do mês,
-- somando TODAS as contas, está abaixo dos tetos?" — e devolve apenas
-- verdadeiro/falso, sem expor o gasto de ninguém. O app chama antes de cada
-- uso de IA (`lib/ai/budget.ts`).
--
-- Os preços vêm do app como parâmetro (`PRECOS_POR_MILHAO_USD` em
-- `lib/ai/cost.ts`): um preço, um lugar. A classificação do modelo por prefixo
-- espelha `provedorDoModelo` no mesmo arquivo.
--
-- Dia e mês em UTC. Linhas ainda sem tokens (chamada em andamento) contam zero.
-- Chamar com tetos inventados só muda a resposta para quem chamou: não libera
-- nem bloqueia uso de ninguém.

create or replace function public.ia_dentro_do_teto(
  p_precos jsonb,
  p_teto_dia numeric,
  p_teto_mes numeric
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with inicio as (
    select (date_trunc('month', now() at time zone 'utc') at time zone 'utc') as mes,
           (date_trunc('day', now() at time zone 'utc') at time zone 'utc') as dia
  ),
  uso as (
    select u.created_at,
           coalesce(u.prompt_tokens, 0) as entrada,
           coalesce(u.completion_tokens, 0) as saida,
           case
             when lower(coalesce(u.model, '')) like 'claude%' then 'anthropic'
             when lower(coalesce(u.model, '')) ~ '^(gpt|o1|o3|o4)' then 'openai'
             else 'kimi'
           end as provedor
    from public.ai_usage u, inicio i
    where u.created_at >= i.mes
  ),
  custo as (
    select created_at,
           (entrada * coalesce((p_precos -> provedor ->> 'entrada')::numeric, 0)
            + saida * coalesce((p_precos -> provedor ->> 'saida')::numeric, 0)) / 1000000.0 as usd
    from uso
  )
  select
    (p_teto_dia is null
       or coalesce(sum(c.usd) filter (where c.created_at >= (select dia from inicio)), 0) < p_teto_dia)
    and
    (p_teto_mes is null or coalesce(sum(c.usd), 0) < p_teto_mes)
  from custo c;
$$;

comment on function public.ia_dentro_do_teto(jsonb, numeric, numeric) is
  'Verdadeiro se o gasto estimado de IA de hoje e do mês (UTC, todas as contas) está abaixo dos tetos. Preços vêm do app. Devolve só o booleano (P52).';

revoke all on function public.ia_dentro_do_teto(jsonb, numeric, numeric) from public, anon;
grant execute on function public.ia_dentro_do_teto(jsonb, numeric, numeric) to authenticated, service_role;
