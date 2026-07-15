-- Circuit breaker por conexão LibreLinkUp: evita martelar a Abbott após
-- falhas repetidas (rate limit / auth / API quebrada) e dá visibilidade
-- operacional via circuit_open_until.

alter table public.cgm_connections
  add column if not exists consecutive_failures integer not null default 0
    check (consecutive_failures >= 0),
  add column if not exists circuit_open_until timestamptz,
  add column if not exists last_error_kind text;

comment on column public.cgm_connections.consecutive_failures is
  'Falhas seguidas de sync; zera após sucesso.';
comment on column public.cgm_connections.circuit_open_until is
  'Até quando o cron deve pular esta conexão (backoff). Null = circuito fechado.';
comment on column public.cgm_connections.last_error_kind is
  'Classificação: auth | rate_limit | unavailable | client_version | crypto | unknown.';
