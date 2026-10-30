-- Valor de exame, evento e mensagem de IA só com o "pai" do PRÓPRIO usuário.
--
-- NÃO APLICADA. Criada em 30/10/2026. Tarefa GLYX-44 — mesma classe de GLYX-10
-- (20261015100000, que fechou adiamento e registro de dose).
--
-- As policies conferiam só `user_id = auth.uid()`: a linha era do usuário, mas
-- a referência podia ser de outra conta. Quem conhecesse o UUID alheio gravava:
--   * `exam_values.exam_id`        → valor pendurado no exame de outra pessoa;
--   * `health_events.medication_id` → evento ligado ao remédio de outra pessoa;
--   * `ai_messages.thread_id`       → mensagem dentro da conversa de outra pessoa.
-- A leitura continuava isolada (cada um só lê as próprias linhas), então não
-- havia vazamento direto. O defeito é de integridade: o dono do pai, ao apagar
-- o exame ou a conversa, apaga em cascata linhas que não são dele, e qualquer
-- leitura futura pelo pai (service role, relatório, exportação) mistura contas.
--
-- Varredura do schema em 30/10/2026: as únicas chaves de tabela de usuário para
-- outra tabela de usuário são estas três e as duas de GLYX-10.
-- `strength_logs.exercise_id` aponta para o catálogo global e fica de fora.
-- Produção em 30/10: 0 linhas cruzadas nas três tabelas.
--
-- O `exists` roda com o RLS do pai: só enxerga as linhas do próprio usuário.
-- A leitura (`using`) não muda. Reexecutável: `drop policy if exists`.

drop policy if exists "exam_values_own" on public.exam_values;
create policy "exam_values_own"
  on public.exam_values for all
  to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.exams e
      where e.id = exam_id and e.user_id = auth.uid()
    )
  );

-- `medication_id` aceita nulo (on delete set null): evento sem remédio, ou cujo
-- remédio foi apagado, continua válido.
drop policy if exists "health_events_own" on public.health_events;
create policy "health_events_own"
  on public.health_events for all
  to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and (
      medication_id is null
      or exists (
        select 1 from public.medications m
        where m.id = medication_id and m.user_id = auth.uid()
      )
    )
  );

drop policy if exists "ai_messages_own" on public.ai_messages;
create policy "ai_messages_own"
  on public.ai_messages for all
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.ai_threads t
      where t.id = thread_id and t.user_id = auth.uid()
    )
  );
