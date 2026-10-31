-- Limite de tentativas de código de convite no cadastro.
--
-- NÃO APLICADA. Criada em 30/10/2026. Programa da IA gestora, Etapa 1 (A8;
-- tarefa GLYX-30, problema P26).
--
-- O convite é um código estático (`SIGNUP_INVITE_CODE`). Não havia limite de
-- tentativas, e a rota `/api/auth/verify-invite` respondia só "certo/errado" —
-- um oráculo para adivinhar o código sem nem tentar criar conta. A rota sai no
-- mesmo PR; aqui fica o limite do cadastro.
--
-- Guarda só o HASH do endereço de rede (sha256 feito no app), nunca o IP, e só
-- as falhas. Linhas com mais de 1 dia são apagadas a cada registro de falha.
-- Só o servidor (service role) lê e escreve — nenhuma policy para usuários.

create table if not exists public.convite_tentativas_falhas (
  id bigint generated always as identity primary key,
  chave text not null,
  criado_em timestamptz not null default now()
);

create index if not exists convite_tentativas_falhas_chave_idx
  on public.convite_tentativas_falhas (chave, criado_em desc);

alter table public.convite_tentativas_falhas enable row level security;

comment on table public.convite_tentativas_falhas is
  'Falhas de código de convite por hash de endereço de rede (A8). Sem dado pessoal; só service role acessa.';

create or replace function public.convite_pode_tentar(
  p_chave text,
  p_limite integer,
  p_janela_segundos integer
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select count(*) < p_limite
  from public.convite_tentativas_falhas
  where chave = p_chave
    and criado_em > now() - make_interval(secs => p_janela_segundos);
$$;

create or replace function public.convite_registrar_falha(p_chave text)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.convite_tentativas_falhas where criado_em < now() - interval '1 day';
  insert into public.convite_tentativas_falhas (chave) values (p_chave);
$$;

revoke all on table public.convite_tentativas_falhas from public, anon, authenticated;
revoke all on function public.convite_pode_tentar(text, integer, integer) from public, anon, authenticated;
revoke all on function public.convite_registrar_falha(text) from public, anon, authenticated;
grant execute on function public.convite_pode_tentar(text, integer, integer) to service_role;
grant execute on function public.convite_registrar_falha(text) to service_role;
