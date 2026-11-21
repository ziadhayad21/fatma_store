-- Flexible deposit percentage system:
-- 1. Add deposit_percent to products (default 50, range 1..100)
-- 2. Add deposit_percent to orders (range 1..100)
-- 3. Backfill existing orders with 30% if deposit was required
-- 4. Update create_order RPC to dynamically calculate deposit based on product deposit_percent

begin;

alter table public.products
  add column if not exists deposit_percent integer not null default 50 check (deposit_percent between 1 and 100);

alter table public.orders
  add column if not exists deposit_percent integer check (deposit_percent between 1 and 100);

-- Backfill existing orders that had a deposit
update public.orders
set deposit_percent = 30
where deposit_amount > 0 and deposit_percent is null;

-- Ensure all existing products have 50 default
update public.products
set deposit_percent = 50
where deposit_percent is null;

-- Update create_order atomic RPC
create or replace function public.create_order(p_order jsonb, p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_number bigint;
  v_deposit boolean;
  v_deposit_percent integer;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'order needs at least one item';
  end if;

  -- Check if order requires deposit (aprons / towels) and determine applied deposit percentage
  select
    exists (
      select 1 from jsonb_array_elements(p_items) i
      join public.products p on p.id = nullif(i->>'product_id','')::uuid
      join public.categories c on c.id = p.category_id where c.slug in ('aprons','towels')
    ),
    coalesce(
      max(p.deposit_percent),
      50
    )
  into v_deposit, v_deposit_percent
  from jsonb_array_elements(p_items) i
  join public.products p on p.id = nullif(i->>'product_id','')::uuid
  join public.categories c on c.id = p.category_id
  where c.slug in ('aprons','towels');

  if exists (
    select 1 from jsonb_array_elements(p_items) i
    join public.products p on p.id = nullif(i->>'product_id','')::uuid
    join public.categories c on c.id = p.category_id
    where
      -- 1. Bags must only be 'standard'
      (c.slug = 'bags' and i->>'mode' <> 'standard')
      -- 2. DIY textiles must only be 'design'
      or (c.slug in ('aprons','towels') and p.is_diy and i->>'mode' <> 'design')
      -- 3. Couples aprons (pieces_count >= 2) allow only 'name' or 'design' (no standard)
      or (c.slug in ('aprons','towels') and not p.is_diy and p.pieces_count >= 2 and i->>'mode' not in ('name', 'design'))
      -- 4. Normal textiles (single non-DIY) allow only 'name'
      or (c.slug in ('aprons','towels') and not p.is_diy and p.pieces_count < 2 and i->>'mode' <> 'name')
      -- 5. Color checks
      or (c.has_colors and (
        nullif(i->>'font','') is not null
        or not exists (
          select 1 from public.product_colors pc
          join public.colors col on col.id = pc.color_id
          where pc.product_id = p.id and pc.color_id = i->>'color' and pc.is_available and col.is_active
        )
      ))
      or (not c.has_colors and nullif(i->>'color','') is not null)
      -- 6. Couples piece validation
      or (i ? 'pieces' and jsonb_typeof(i->'pieces') = 'array'
          and (p.pieces_count < 2 or jsonb_array_length(i->'pieces') <> p.pieces_count))
      or (p.pieces_count >= 2 and not (i ? 'pieces' and jsonb_typeof(i->'pieces') = 'array'))
  ) then raise exception 'invalid customization for category'; end if;

  if v_deposit and (
    coalesce(p_order->>'deposit_method','') not in ('instapay','wallet')
    or coalesce(p_order->>'payment_proof_path','') !~ '^proofs/[0-9]{4}-[0-9]{2}/[0-9a-f-]{36}\.(png|jpg|webp)$'
    or not exists (select 1 from storage.objects where bucket_id = 'payment-proofs' and name = p_order->>'payment_proof_path')
  ) then raise exception 'deposit transfer proof is required'; end if;

  insert into public.orders
    (customer_name, phone, governorate, area, address, notes, payment_method, subtotal, shipping, total, customization_notes, deposit_amount, deposit_status, deposit_method, payment_proof_path, deposit_percent)
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
    (p_order ->> 'total')::numeric,
    case when v_deposit then nullif(p_order->>'customization_notes','') end,
    case when v_deposit then round((p_order->>'total')::numeric * (v_deposit_percent::numeric / 100.0), 2) else 0 end,
    case when v_deposit then 'submitted' end,
    case when v_deposit then p_order->>'deposit_method' end,
    case when v_deposit then p_order->>'payment_proof_path' end,
    case when v_deposit then v_deposit_percent end
  )
  returning id, number into v_id, v_number;

  insert into public.order_items
    (order_id, product_id, name_snapshot, mode, text, font, design_path, unit_price, qty, original_unit_price, discount_percent, color, color_name, pieces)
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
    (i ->> 'discount_percent')::numeric,
    nullif(i ->> 'color', ''),
    (select col.name_ar from public.colors col where col.id = nullif(i ->> 'color', '')),
    case when jsonb_typeof(i -> 'pieces') = 'array' then i -> 'pieces' end
  from jsonb_array_elements(p_items) as i;

  return jsonb_build_object('id', v_id, 'number', v_number);
end;
$$;

revoke all on function public.create_order(jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.create_order(jsonb, jsonb) to service_role;

commit;
