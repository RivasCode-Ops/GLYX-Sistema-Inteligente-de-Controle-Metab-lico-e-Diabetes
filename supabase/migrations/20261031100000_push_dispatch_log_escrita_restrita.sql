-- Registro de despacho de notificação: o usuário não forja nem bloqueia alarme.
--
-- NÃO APLICADA. Criada em 30/10/2026. Programa da IA gestora, Etapa 1 (A3 da
-- auditoria de 30/10).
--
-- O que havia (20260711180000): `push_dispatch_log_own` era `for all` para o
-- dono. Com o despachante de 20261015103000, duas consequências:
--   * uma linha `kind='med'`, `status='pendente'` com `payload` inventado era
--     reivindicada e virava notificação nos aparelhos do próprio usuário;
--   * uma linha `kind='med'` gravada ANTES do horário ocupava o slot único
--     `(user_id, kind, ref, sent_on)`, e o alarme verdadeiro daquela dose
--     batia no `on conflict do nothing` e não saía.
--
-- Quem grava aqui com a sessão do usuário (conferido em 30/10/2026):
--   * `lib/insights/rules.ts` — trava de duplicata do alerta de glicemia
--     (`kind='metabolic_alert'`);
--   * `lib/cgm/sync.ts` e `sync-dexcom.ts` — trava do alerta de queda
--     (`kind='hypo'`);
--   * a exclusão LGPD (`app/actions/privacy.ts`) — apaga as linhas do dono.
-- Todo o resto (alarmes, estoque, adiamentos, água, dica, sugestão, sensor
-- parado) é gravado pelas funções de cron, SECURITY DEFINER, que não passam
-- por RLS.
--
-- Agora: o dono lê e apaga as próprias linhas; insere só os dois tipos acima,
-- sem estado de envio e sem conteúdo — nada que o despachante reivindique.
-- Não pode alterar linha nenhuma.

drop policy if exists "push_dispatch_log_own" on public.push_dispatch_log;
drop policy if exists "push_dispatch_log_select_own" on public.push_dispatch_log;
drop policy if exists "push_dispatch_log_insert_trava_de_alerta" on public.push_dispatch_log;
drop policy if exists "push_dispatch_log_delete_own" on public.push_dispatch_log;

create policy "push_dispatch_log_select_own"
  on public.push_dispatch_log for select
  to authenticated
  using (auth.uid() = user_id);

create policy "push_dispatch_log_insert_trava_de_alerta"
  on public.push_dispatch_log for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and kind in ('metabolic_alert', 'hypo')
    and status = 'enviado'
    and payload is null
    and scheduled_at is null
  );

create policy "push_dispatch_log_delete_own"
  on public.push_dispatch_log for delete
  to authenticated
  using (auth.uid() = user_id);
