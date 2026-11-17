begin;

create index if not exists order_items_product_id_idx
  on public.order_items (product_id)
  where product_id is not null;

create function public.admin_delete_product(p_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_slug text;
  v_category_id uuid;
  v_category_slug text;
  v_archived boolean;
begin
  if not public.is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;

  -- Hold the product row lock through the history check and the change.
  -- Checkout's order_items foreign key uses a conflicting lock on this row.
  select slug, category_id into v_slug, v_category_id
  from public.products where id = p_id
  for update;

  if not found then
    return null;
  end if;

  select slug into v_category_slug from public.categories where id = v_category_id;

  select exists (
    select 1 from public.order_items where product_id = p_id
  ) into v_archived;

  if v_archived then
    update public.products set is_active = false where id = p_id and is_active;
  else
    delete from public.products where id = p_id;
  end if;

  return jsonb_build_object('slug', v_slug, 'category_slug', v_category_slug, 'archived', v_archived);
end;
$$;

revoke execute on function public.admin_delete_product(uuid) from public, anon;
grant execute on function public.admin_delete_product(uuid) to authenticated;

commit;
