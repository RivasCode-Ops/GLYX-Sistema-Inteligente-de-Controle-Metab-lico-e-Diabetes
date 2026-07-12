-- Conexão automática de sensor (LibreLinkUp): o GLYX atua como um
-- "seguidor" do FreeStyle Libre, igual ao médico/família. Credenciais da
-- conta LibreLinkUp guardadas cifradas (AES-256-GCM, chave derivada de
-- env no servidor) — nunca em texto puro.

create table if not exists public.cgm_connections (
  user_id uuid primary key references auth.users (id) on delete cascade,
  provider text not null default 'librelinkup' check (provider = 'librelinkup'),
  email text not null,
  credentials_enc text not null,
  patient_id text,
  last_sync_at timestamptz,
  last_error text,
  created_at timestamptz not null default now()
);

alter table public.cgm_connections enable row level security;

create policy "cgm_connections_own"
  on public.cgm_connections for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
