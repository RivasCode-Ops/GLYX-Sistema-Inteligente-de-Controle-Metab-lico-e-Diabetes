-- Adiamento e registro de dose só com medicamento do PRÓPRIO usuário.
--
-- NÃO APLICADA. Criada em 14/10/2026 como arquivo. Tarefa GLYX-10.
--
-- As policies antigas conferiam só `auth.uid() = user_id`. A linha era do
-- usuário, mas o `medication_id` podia ser de outra conta: quem conhecesse o
-- UUID de um medicamento alheio criava um adiamento com ele, e o despachante
-- (SECURITY DEFINER, ignora RLS) mandava por push o nome e a dose da vítima.
-- O despachante foi corrigido em 20261015103000; esta migration fecha a porta
-- na gravação.
--
-- O `exists` roda com o RLS de `medications` do próprio usuário: só enxerga os
-- medicamentos dele. A leitura (`using`) não muda.
--
-- Reexecutável: `drop policy if exists` antes de cada `create policy`.

drop policy if exists "medication_snoozes_own" on public.medication_snoozes;
create policy "medication_snoozes_own"
  on public.medication_snoozes for all
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.medications m
      where m.id = medication_id and m.user_id = auth.uid()
    )
  );

-- `medication_id` aceita nulo (on delete set null): registro de remédio já
-- apagado continua válido.
drop policy if exists "med_logs_all_own" on public.medication_logs;
create policy "med_logs_all_own"
  on public.medication_logs for all
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and (
      medication_id is null
      or exists (
        select 1 from public.medications m
        where m.id = medication_id and m.user_id = auth.uid()
      )
    )
  );
