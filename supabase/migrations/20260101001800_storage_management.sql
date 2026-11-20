-- Storage management: admins may delete orders; old order files can be cleaned up (orders kept);
-- the dashboard reads database / storage usage. Additive + policies only (the live site shares this DB).
begin;
set local lock_timeout = '5s';

-- ---------------------------------------------------------------- delete orders (admins only)
-- order_items go with their order (ON DELETE CASCADE); suggestions keep existing with order_id = null
-- (ON DELETE SET NULL). Order numbers come from an identity column, so they are never reused.
grant delete on public.orders to authenticated;
create policy orders_admin_delete on public.orders
  for delete to authenticated using (public.is_admin());

-- ---------------------------------------------------------------- old files cleaned up, order kept
-- Set when the cleanup removed this order's files (designs, transfer proof); the admin then shows
-- "الملف اتمسح بعد التنظيف" instead of a broken image. The paths themselves stay as a record.
alter table public.orders add column files_purged_at timestamptz;

-- Files of delivered / cancelled orders older than p_months, with their size in storage.
-- A design that an order outside that set still uses is never listed.
create function public.admin_file_cleanup_candidates(p_months integer)
returns table (order_id uuid, bucket text, path text, bytes bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  if p_months is null or p_months < 1 or p_months > 120 then
    raise exception 'months must be between 1 and 120';
  end if;
  return query
  with old as (
    select o.id from public.orders o
    where o.status in ('delivered', 'cancelled')
      and o.created_at < now() - make_interval(months => p_months)
  ),
  files as (
    select o.id as order_id, 'payment-proofs'::text as bucket, o.payment_proof_path as path
    from public.orders o join old on old.id = o.id
    where o.payment_proof_path is not null
    union
    select i.order_id, 'designs', i.design_path
    from public.order_items i join old on old.id = i.order_id
    where i.design_path is not null
    union
    select i.order_id, 'designs', e ->> 'design_path'
    from public.order_items i join old on old.id = i.order_id
    cross join lateral jsonb_array_elements(coalesce(i.pieces, '[]'::jsonb)) e
    where e ->> 'design_path' is not null
  )
  select f.order_id, f.bucket, f.path, coalesce((so.metadata ->> 'size')::bigint, 0)
  from files f
  join storage.objects so on so.bucket_id = f.bucket and so.name = f.path -- only files that still exist
  where not exists ( -- shared with an order that is not being cleaned
    select 1 from public.order_items i2
    where i2.order_id not in (select id from old)
      and (i2.design_path = f.path
           or exists (select 1 from jsonb_array_elements(coalesce(i2.pieces, '[]'::jsonb)) e2 where e2 ->> 'design_path' = f.path))
  )
  and not exists (
    select 1 from public.orders o2 where o2.id not in (select id from old) and o2.payment_proof_path = f.path
  );
end;
$$;
revoke all on function public.admin_file_cleanup_candidates(integer) from public, anon, authenticated;
grant execute on function public.admin_file_cleanup_candidates(integer) to authenticated, service_role;

-- ---------------------------------------------------------------- usage for the dashboard (server only)
create function public.admin_storage_usage()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return jsonb_build_object(
    'db_bytes', pg_database_size(current_database()),
    'storage_bytes', coalesce((select sum((metadata ->> 'size')::bigint) from storage.objects), 0),
    'buckets', coalesce((
      select jsonb_object_agg(bucket_id, bytes) from (
        select bucket_id, sum((metadata ->> 'size')::bigint) as bytes from storage.objects group by bucket_id
      ) b
    ), '{}'::jsonb)
  );
end;
$$;
revoke all on function public.admin_storage_usage() from public, anon, authenticated;
grant execute on function public.admin_storage_usage() to service_role;

commit;
