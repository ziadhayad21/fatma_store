-- Colours move into their own table, with a price per product and colour.
--
-- Additive and backward-compatible with the code deployed before this migration:
--  * nothing is dropped or renamed; existing data is not rewritten (personalization_fee keeps its
--    values: the new code simply ignores it; a later migration drops it once the new code is live);
--  * new columns have defaults; create_order accepts the same payload as before;
--  * a trigger keeps product_colors filled from base_price, so products added or re-priced with the
--    old admin stay orderable at the price the old site shows.
-- Existing orders keep their stored prices: nothing here touches orders.subtotal/total or
-- order_items.unit_price.
begin;
set local lock_timeout = '5s';

-- ---------------------------------------------------------------- colours
create table public.colors (
  id text primary key check (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(id) <= 40),
  name_ar text not null check (char_length(name_ar) between 1 and 40),
  hex text not null check (hex ~ '^#[0-9A-Fa-f]{6}$'),
  sort integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- the ids match what carts and existing order items already store
insert into public.colors (id, name_ar, hex, sort) values
  ('black', 'أسود', '#1A1A1A', 1),
  ('white', 'أبيض', '#FFFFFF', 2),
  ('pink', 'وردي', '#F4A7C0', 3)
on conflict (id) do nothing;

create table public.product_colors (
  product_id uuid not null references public.products (id) on delete cascade,
  color_id text not null references public.colors (id) on update cascade on delete restrict,
  price numeric(10, 2) not null check (price >= 0),
  is_available boolean not null default true,
  primary key (product_id, color_id)
);
create index product_colors_color_idx on public.product_colors (color_id);

alter table public.categories add column has_colors boolean not null default false;
update public.categories set has_colors = true where slug in ('aprons', 'towels');

-- existing colour-enabled products: every colour, at the product's current price
insert into public.product_colors (product_id, color_id, price)
select p.id, c.id, p.base_price
from public.products p
join public.categories cat on cat.id = p.category_id and cat.has_colors
cross join public.colors c
on conflict do nothing;

-- Keep colour rows in step with products written by code that only knows base_price (the old admin):
--  * a new product (or one moved into a colour category) gets every active colour at its base_price;
--  * when base_price changes and all its colours still share the old price, they follow it.
-- Colours priced individually (the new admin) are never overwritten.
create function public.sync_product_colors()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from public.categories c where c.id = new.category_id and c.has_colors) then
    return null;
  end if;
  if tg_op = 'UPDATE' and new.base_price <> old.base_price
     and not exists (select 1 from public.product_colors pc where pc.product_id = new.id and pc.price <> old.base_price) then
    update public.product_colors set price = new.base_price where product_id = new.id;
  end if;
  -- only for new products / products moved into a colour category: a colour removed on purpose
  -- (admin_save_product_colors) must not come back on a later price change
  if tg_op = 'INSERT' or new.category_id is distinct from old.category_id then
    insert into public.product_colors (product_id, color_id, price)
    select new.id, c.id, new.base_price from public.colors c where c.is_active
    on conflict do nothing;
  end if;
  return null;
end;
$$;
revoke execute on function public.sync_product_colors() from public, anon, authenticated;
create trigger products_sync_colors
  after insert or update of base_price, category_id on public.products
  for each row execute function public.sync_product_colors();

-- ---------------------------------------------------------------- order items: colour snapshot
alter table public.order_items drop constraint if exists order_items_color_check;
alter table public.order_items
  add constraint order_items_color_fkey foreign key (color) references public.colors (id) on update cascade on delete restrict,
  add column color_name text check (color_name is null or char_length(color_name) <= 40);
update public.order_items i set color_name = c.name_ar
from public.colors c where c.id = i.color and i.color_name is null;

-- ---------------------------------------------------------------- privileges + RLS (same model as products)
revoke all on table public.colors, public.product_colors from public, anon, authenticated;
grant select on public.colors, public.product_colors to anon, authenticated;
grant insert, update, delete on public.colors, public.product_colors to authenticated;

alter table public.colors enable row level security;
alter table public.product_colors enable row level security;

create policy colors_public_read on public.colors
  for select to anon, authenticated using (is_active);
create policy colors_admin_all on public.colors
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy product_colors_public_read on public.product_colors
  for select to anon, authenticated
  using (
    is_available
    and exists (
      select 1 from public.products p
      join public.categories c on c.id = p.category_id
      where p.id = product_id and p.is_active and c.is_active
    )
  );
create policy product_colors_admin_all on public.product_colors
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------- admin: save a product's colours atomically
-- p_colors: [{ "color_id": "black", "price": 120, "is_available": true }, ...]
-- Colours not in the list are removed. base_price follows the lowest available colour price,
-- so sorting by price and the "from" price on cards stay correct.
create function public.admin_save_product_colors(p_product_id uuid, p_colors jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  if p_colors is null or jsonb_typeof(p_colors) <> 'array' then
    raise exception 'colors must be an array';
  end if;

  delete from public.product_colors pc
  where pc.product_id = p_product_id
    and pc.color_id not in (select x ->> 'color_id' from jsonb_array_elements(p_colors) x);

  insert into public.product_colors (product_id, color_id, price, is_available)
  select p_product_id, x ->> 'color_id', (x ->> 'price')::numeric, coalesce((x ->> 'is_available')::boolean, true)
  from jsonb_array_elements(p_colors) x
  on conflict (product_id, color_id)
  do update set price = excluded.price, is_available = excluded.is_available;

  update public.products p
  set base_price = m.price
  from (
    select min(pc.price) as price from public.product_colors pc
    where pc.product_id = p_product_id and pc.is_available
  ) m
  where p.id = p_product_id and m.price is not null and p.base_price <> m.price;
end;
$$;
revoke execute on function public.admin_save_product_colors(uuid, jsonb) from public, anon;
grant execute on function public.admin_save_product_colors(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------- create_order: colours from the table
-- Same payload as before. Colour rules now follow categories.has_colors and product_colors
-- instead of a hard-coded list; the colour name is snapshotted from public.colors.
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
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'order needs at least one item';
  end if;

  select exists (
    select 1 from jsonb_array_elements(p_items) i
    join public.products p on p.id = nullif(i->>'product_id','')::uuid
    join public.categories c on c.id = p.category_id where c.slug in ('aprons','towels')
  ) into v_deposit;
  if exists (
    select 1 from jsonb_array_elements(p_items) i
    join public.products p on p.id = nullif(i->>'product_id','')::uuid
    join public.categories c on c.id = p.category_id
    where (c.slug = 'bags' and i->>'mode' <> 'standard')
      or (c.has_colors and (
        nullif(i->>'font','') is not null
        or not exists (
          select 1 from public.product_colors pc
          join public.colors col on col.id = pc.color_id
          where pc.product_id = p.id and pc.color_id = i->>'color' and pc.is_available and col.is_active
        )
      ))
      or (not c.has_colors and nullif(i->>'color','') is not null)
  ) then raise exception 'invalid customization for category'; end if;
  if v_deposit and (
    coalesce(p_order->>'deposit_method','') not in ('instapay','wallet')
    or coalesce(p_order->>'payment_proof_path','') !~ '^proofs/[0-9]{4}-[0-9]{2}/[0-9a-f-]{36}\.(png|jpg|webp)$'
    or not exists (select 1 from storage.objects where bucket_id = 'payment-proofs' and name = p_order->>'payment_proof_path')
  ) then raise exception 'deposit transfer proof is required'; end if;

  insert into public.orders
    (customer_name, phone, governorate, area, address, notes, payment_method, subtotal, shipping, total, customization_notes, deposit_amount, deposit_status, deposit_method, payment_proof_path)
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
    case when v_deposit then round((p_order->>'total')::numeric * 0.3, 2) else 0 end,
    case when v_deposit then 'submitted' end,
    case when v_deposit then p_order->>'deposit_method' end,
    case when v_deposit then p_order->>'payment_proof_path' end
  )
  returning id, number into v_id, v_number;

  insert into public.order_items
    (order_id, product_id, name_snapshot, mode, text, font, design_path, unit_price, qty, original_unit_price, discount_percent, color, color_name)
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
    (select col.name_ar from public.colors col where col.id = nullif(i ->> 'color', ''))
  from jsonb_array_elements(p_items) as i;

  return jsonb_build_object('id', v_id, 'number', v_number);
end;
$$;

revoke all on function public.create_order(jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.create_order(jsonb, jsonb) to service_role;

commit;
