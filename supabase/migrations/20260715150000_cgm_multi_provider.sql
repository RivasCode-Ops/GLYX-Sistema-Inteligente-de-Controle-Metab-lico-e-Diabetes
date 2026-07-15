-- Multi-provider CGM: LibreLinkUp (senha) + Dexcom (OAuth).
-- PK passa a (user_id, provider); email fica opcional (Dexcom não usa).

alter table public.cgm_connections
  drop constraint if exists cgm_connections_provider_check;

alter table public.cgm_connections
  drop constraint if exists cgm_connections_pkey;

alter table public.cgm_connections
  alter column email drop not null;

alter table public.cgm_connections
  add constraint cgm_connections_provider_check
    check (provider in ('librelinkup', 'dexcom'));

alter table public.cgm_connections
  add primary key (user_id, provider);

comment on column public.cgm_connections.credentials_enc is
  'LibreLinkUp: JSON {email,password} cifrado. Dexcom: JSON {access_token,refresh_token,expires_at} cifrado.';
