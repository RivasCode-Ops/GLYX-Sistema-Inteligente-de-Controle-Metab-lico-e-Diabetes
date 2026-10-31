-- Fuso validado nos jobs de água, sugestão de refeição e sensor parado.
--
-- NÃO APLICADA. Criada em 30/10/2026. Programa da IA gestora, Etapa 1 (A14).
--
-- `at time zone 'texto-inválido'` lança erro e aborta a função INTEIRA: um único
-- perfil com fuso malformado derrubava o lembrete de água, a sugestão de
-- refeição e o aviso de sensor parado de TODOS os usuários. A 20261015103000
-- corrigiu isso só nos alarmes de remédio, criando `glyx_fuso_valido`; estes
-- três jobs continuavam com `coalesce(p.timezone, 'America/Sao_Paulo')`.
--
-- Mesma técnica da 20260726020000 (`app_base_url`): transforma a definição que
-- está NO BANCO com `pg_get_functiondef` e uma troca textual, em vez de
-- redigitar funções longas — e funciona com o que estiver em produção, que já
-- passou por reescritas automáticas. Diferente daquela, esta falha alto se o
-- trecho esperado não existir: troca que não acontece em silêncio é o defeito
-- que se quer evitar.
--
-- `dispatch_daily_tip` fica de fora: não usa fuso (usa `current_date`).

do $fuso$
declare
  alvo text;
  def_atual text;
  def_nova text;
  antigo constant text := 'coalesce(p.timezone, ''America/Sao_Paulo'')';
  novo constant text := 'public.glyx_fuso_valido(p.timezone)';
begin
  if to_regprocedure('public.glyx_fuso_valido(text)') is null then
    raise exception 'glyx_fuso_valido não existe — aplique 20261015103000 antes.';
  end if;

  foreach alvo in array array['dispatch_water_reminder', 'dispatch_meal_suggestions', 'dispatch_sensor_stale_alert']
  loop
    def_atual := pg_get_functiondef(format('public.%I()', alvo)::regprocedure);
    if position(novo in def_atual) > 0 and position(antigo in def_atual) = 0 then
      raise notice '% já usa glyx_fuso_valido', alvo;
      continue;
    end if;
    if position(antigo in def_atual) = 0 then
      raise exception '% não contém o trecho esperado de fuso; revisar à mão.', alvo;
    end if;
    def_nova := replace(def_atual, antigo, novo);
    execute def_nova;
    raise notice 'fuso validado em %', alvo;
  end loop;
end;
$fuso$;
