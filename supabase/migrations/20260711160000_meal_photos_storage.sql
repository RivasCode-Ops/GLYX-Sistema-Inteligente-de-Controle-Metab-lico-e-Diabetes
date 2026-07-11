-- Fotos de refeição: bucket privado + caminho na refeição
-- Estrutura de pasta: <user_id>/<uuid>.<ext> — políticas restringem ao dono.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('meal-photos', 'meal-photos', false, 4194304, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "meal_photos_select_own"
  on storage.objects for select
  using (bucket_id = 'meal-photos' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "meal_photos_insert_own"
  on storage.objects for insert
  with check (bucket_id = 'meal-photos' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "meal_photos_delete_own"
  on storage.objects for delete
  using (bucket_id = 'meal-photos' and auth.uid()::text = (storage.foldername(name))[1]);

alter table public.meals
  add column if not exists photo_path text;

comment on column public.meals.photo_path is 'Caminho no bucket meal-photos (privado); null para refeições sem foto';
