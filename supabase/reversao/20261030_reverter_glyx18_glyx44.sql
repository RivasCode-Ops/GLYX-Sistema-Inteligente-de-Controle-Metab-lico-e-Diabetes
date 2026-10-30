-- Reversão de 20261030140000 (GLYX-18) e 20261030130000 (GLYX-44).
--
-- Fora de supabase/migrations: nunca aplicado pela CLI. Uma transação; blocos na
-- ordem inversa da aplicação. Reverter o banco ANTES do código só se o código
-- novo não tiver recuo — aqui tem: `definirContaDesativada` volta sozinha ao
-- UPDATE antigo quando a RPC some.
--
-- O que NÃO volta: nada de dado é alterado por estas migrations.

begin;

-- Bloco 1 — 20261030140000: devolve as policies amplas de admin e tira a RPC.
-- Definições iguais às de 20260713150000.
drop policy if exists "profiles_select_admin" on public.profiles;
create policy "profiles_select_admin" on public.profiles
  for select using (public.is_current_user_admin());
drop policy if exists "profiles_update_admin" on public.profiles;
create policy "profiles_update_admin" on public.profiles
  for update using (public.is_current_user_admin()) with check (public.is_current_user_admin());
drop function if exists public.admin_definir_conta_desativada(uuid, boolean);

-- Bloco 2 — 20261030130000: policies de filho voltam a conferir só o user_id.
drop policy if exists "exam_values_own" on public.exam_values;
create policy "exam_values_own" on public.exam_values
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "health_events_own" on public.health_events;
create policy "health_events_own" on public.health_events
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "ai_messages_own" on public.ai_messages;
create policy "ai_messages_own" on public.ai_messages
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

commit;
