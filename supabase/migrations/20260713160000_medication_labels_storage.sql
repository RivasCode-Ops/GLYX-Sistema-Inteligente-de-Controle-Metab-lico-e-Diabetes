-- Foto do rótulo anexada ao próprio medicamento/suplemento (opcional).
-- Mesmo padrão do meal-photos: bucket privado, pasta por usuário.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('medication-labels', 'medication-labels', false, 4194304, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "medication_labels_select_own"
  on storage.objects for select
  using (bucket_id = 'medication-labels' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "medication_labels_insert_own"
  on storage.objects for insert
  with check (bucket_id = 'medication-labels' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "medication_labels_delete_own"
  on storage.objects for delete
  using (bucket_id = 'medication-labels' and auth.uid()::text = (storage.foldername(name))[1]);

alter table public.medications
  add column if not exists label_photo_path text;

comment on column public.medications.label_photo_path is 'Caminho no bucket medication-labels (privado); null quando não há foto anexada';
