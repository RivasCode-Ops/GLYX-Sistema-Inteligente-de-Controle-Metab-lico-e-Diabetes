-- Sugestão automática de refeição por IA só com consentimento.
--
-- NÃO APLICADA. Criada em 30/10/2026. Programa da IA gestora, Etapa 1 (A1;
-- problema P06; decisões D5/D13 pendentes).
--
-- O job `glyx-meal-suggest` (a cada 15 min) enviava ao provedor de IA o tipo
-- de diabetes e a última glicemia de TODA conta ativa com notificação, sem
-- nenhuma ação do titular — contrariando o DPIA (§3, §6) e a política de
-- privacidade (docs/P06-ENVIO-AUTOMATICO-IA.md).
--
-- Agora o envio exige opt-in explícito, guardado no perfil e revogável na tela
-- de Perfil. Padrão: desligado — inclusive para as contas existentes. Isso
-- equivale, na prática, à pausa proposta em D13 até a pessoa ligar.
--
-- Duas camadas, de propósito:
--   1. aqui, o job nem monta o pedido de quem não consentiu (o dado não sai do
--      banco);
--   2. a rota `/api/meals/suggest-dispatch` confere o consentimento de novo
--      antes de chamar o modelo — vale mesmo se esta migration ainda não
--      tiver sido aplicada (sem a coluna, a rota trata como "não consentiu").
--
-- A transformação da função segue a técnica de 20260726020000 e falha alto se
-- o trecho esperado não existir.

alter table public.profiles
  add column if not exists ia_sugestao_automatica boolean not null default false;

comment on column public.profiles.ia_sugestao_automatica is
  'Consentimento para a sugestão automática de refeição por IA (envia tipo de diabetes, objetivo, última glicemia e totais do dia ao provedor). Padrão desligado; o titular liga e desliga no Perfil.';

do $consent$
declare
  def_atual text;
  antigo constant text := 'where not p.disabled';
  novo constant text := 'where not p.disabled and p.ia_sugestao_automatica';
begin
  def_atual := pg_get_functiondef('public.dispatch_meal_suggestions()'::regprocedure);
  if position(novo in def_atual) > 0 then
    raise notice 'dispatch_meal_suggestions já filtra por consentimento';
    return;
  end if;
  if (length(def_atual) - length(replace(def_atual, antigo, ''))) / length(antigo) <> 1 then
    raise exception 'dispatch_meal_suggestions: esperava exatamente um "%"; revisar à mão.', antigo;
  end if;
  execute replace(def_atual, antigo, novo);
  raise notice 'dispatch_meal_suggestions passa a exigir consentimento';
end;
$consent$;
