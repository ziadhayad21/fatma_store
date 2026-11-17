begin;

set local lock_timeout = '5s';

alter table public.products
  add column discount_percent numeric(4, 2),
  add constraint products_discount_percent_check
    check (discount_percent > 0 and discount_percent < 100),
  add column sale_price numeric(10, 2) generated always as
    (round(base_price * (1 - coalesce(discount_percent, 0) / 100), 2)) stored;

alter table public.order_items
  add column original_unit_price numeric(10, 2),
  add column discount_percent numeric(4, 2),
  add constraint order_items_discount_snapshot_check check (
    (discount_percent is null and original_unit_price is null)
    or (
      discount_percent is not null and discount_percent > 0 and discount_percent < 100
      and original_unit_price is not null
      and original_unit_price between unit_price and 99999999.99
    )
  );

-- Keep the existing service-role-only RPC and write the server-priced snapshots
-- in the same transaction as the order. Older callers can omit these fields.
create or replace function public.create_order(p_order jsonb, p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_number bigint;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'order needs at least one item';
  end if;

  insert into public.orders
    (customer_name, phone, governorate, area, address, notes, payment_method, subtotal, shipping, total)
  values (
    p_order ->> 'customer_name',
    p_order ->> 'phone',
    p_order ->> 'governorate',
    p_order ->> 'area',
    p_order ->> 'address',
    nullif(p_order ->> 'notes', ''),
    coalesce(p_order ->> 'payment_method', 'cod'),
    (p_order ->> 'subtotal')::numeric,
    (p_order ->> 'shipping')::numeric,
    (p_order ->> 'total')::numeric
  )
  returning id, number into v_id, v_number;

  insert into public.order_items
    (order_id, product_id, name_snapshot, mode, text, font, design_path, unit_price, qty, original_unit_price, discount_percent)
  select
    v_id,
    nullif(i ->> 'product_id', '')::uuid,
    i ->> 'name_snapshot',
    i ->> 'mode',
    nullif(i ->> 'text', ''),
    nullif(i ->> 'font', ''),
    nullif(i ->> 'design_path', ''),
    (i ->> 'unit_price')::numeric,
    (i ->> 'qty')::integer,
    (i ->> 'original_unit_price')::numeric,
    (i ->> 'discount_percent')::numeric
  from jsonb_array_elements(p_items) as i;

  return jsonb_build_object('id', v_id, 'number', v_number);
end;
$$;

revoke all on function public.create_order(jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.create_order(jsonb, jsonb) to service_role;

commit;
