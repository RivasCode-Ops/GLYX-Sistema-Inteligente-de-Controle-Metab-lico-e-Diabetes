-- glyx_fuso_valido sem varrer pg_timezone_names a cada chamada.
--
-- NÃO APLICADA. Criada em 30/10/2026, depois de aplicar 20261015103000 em
-- produção.
--
-- O que se mediu em produção (30/10/2026, 21:10 UTC):
--   * o cron glyx-med-alarms levava 0,04 s por execução (71 execuções em 6 h)
--     e passou a levar 8,3 s logo depois da 20261015103000;
--   * uma chamada a glyx_fuso_valido custa ~50 ms, quase todos para listar os
--     1.196 fusos de pg_timezone_names (49 ms medidos para a varredura sozinha);
--   * sendo `language sql` e `stable`, ela é embutida na consulta e reavaliada
--     a cada referência a `tz` em med_alarms_due, no estoque e nos adiamentos.
-- Os alarmes funcionavam; o custo crescia com o número de usuários.
--
-- Agora: plpgsql, e o teste é o próprio `at time zone` — o que precisa não
-- lançar é exatamente ele. Custa microssegundos. O contrato não muda: fuso
-- nulo, vazio ou que o Postgres recusa vira America/Sao_Paulo; o envio de
-- todos não cai por um perfil com fuso inválido.
--
-- Diferença assumida: além dos nomes de pg_timezone_names, passam a valer as
-- outras formas que `at time zone` aceita (abreviações como 'UTC', deslocamento
-- POSIX). Todas produzem horário válido, que é o que a função protege.

create or replace function public.glyx_fuso_valido(p_tz text)
returns text
language plpgsql
stable
set search_path = public
as $$
declare
  tz text := nullif(trim(p_tz), '');
begin
  if tz is null then
    return 'America/Sao_Paulo';
  end if;
  perform now() at time zone tz;
  return tz;
exception when others then
  return 'America/Sao_Paulo';
end;
$$;

revoke all on function public.glyx_fuso_valido(text) from public, anon, authenticated;
