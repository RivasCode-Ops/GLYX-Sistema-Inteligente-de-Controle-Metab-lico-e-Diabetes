-- Tokens OAuth do Google Fit por usuário, cifrados (mesmo padrão AES-256-GCM
-- de cgm_connections, via encryptCredential/decryptCredential).
create table if not exists public.google_fit_connections (
  user_id uuid primary key references auth.users (id) on delete cascade,
  tokens_enc text not null,
  last_sync_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.google_fit_connections is 'Tokens OAuth do Google Fit (cifrados) — um por usuário.';

alter table public.google_fit_connections enable row level security;

create policy "google_fit_connections_own"
  on public.google_fit_connections for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
