-- Storage buckets.
--   product-images : PUBLIC (shop photos). Only admins can write.
--   designs        : PRIVATE (customer uploads). No anon/customer policies at all:
--                    customers upload through single-use signed upload URLs issued by the server,
--                    and only admins can read/delete (signed download URLs).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('product-images', 'product-images', true, 5242880, array['image/png', 'image/jpeg', 'image/webp']),
  ('designs', 'designs', false, 10485760, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy designs_admin_select on storage.objects
  for select to authenticated using (bucket_id = 'designs' and public.is_admin());
create policy designs_admin_delete on storage.objects
  for delete to authenticated using (bucket_id = 'designs' and public.is_admin());

create policy product_images_admin_insert on storage.objects
  for insert to authenticated with check (bucket_id = 'product-images' and public.is_admin());
create policy product_images_admin_update on storage.objects
  for update to authenticated
  using (bucket_id = 'product-images' and public.is_admin())
  with check (bucket_id = 'product-images' and public.is_admin());
create policy product_images_admin_delete on storage.objects
  for delete to authenticated using (bucket_id = 'product-images' and public.is_admin());
create policy product_images_admin_select on storage.objects
  for select to authenticated using (bucket_id = 'product-images' and public.is_admin());
