-- فاطمة — core schema.
-- Security model: RLS is ON for every table. Customers (anon) can only read active catalog rows
-- and shipping rates. Orders, order items, newsletter subscribers and the admin list have NO
-- anon/authenticated write access: they are written by server code with the service role
-- (the secret key), and read only by admins (public.is_admin()).

-- ---------------------------------------------------------------- helpers
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------- admins
create table public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.admins a where a.user_id = (select auth.uid()));
$$;

-- Run from the SQL editor (or with the secret key) after creating the user in Authentication > Users.
create or replace function public.grant_admin(p_email text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  select u.id into v_id from auth.users u where lower(u.email) = lower(trim(p_email)) limit 1;
  if v_id is null then
    raise exception 'No auth user with email %. Create the user first (Authentication > Users).', p_email;
  end if;
  insert into public.admins (user_id) values (v_id) on conflict do nothing;
end;
$$;

-- ---------------------------------------------------------------- categories
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name_ar text not null check (char_length(name_ar) between 1 and 80),
  description_ar text not null default '',
  image text not null default '',
  image_alt text not null default '',
  image_position text not null default 'center',
  promo_title_ar text not null default '',
  sort integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index categories_active_sort_idx on public.categories (is_active, sort);
create trigger categories_updated_at before update on public.categories
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------- products
create table public.products (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name_ar text not null check (char_length(name_ar) between 1 and 160),
  category_id uuid not null references public.categories (id) on delete restrict,
  description_ar text not null default '',
  details_ar text not null default '',
  care_ar text not null default '',
  base_price numeric(10, 2) not null check (base_price >= 0),
  personalization_fee numeric(10, 2) not null default 0 check (personalization_fee >= 0),
  images jsonb not null default '[]'::jsonb check (jsonb_typeof(images) = 'array'),
  is_active boolean not null default true,
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- products(slug) is covered by the UNIQUE constraint's index.
create index products_category_active_sort_idx on public.products (category_id, is_active, sort);
create index products_active_sort_idx on public.products (is_active, sort);
create trigger products_updated_at before update on public.products
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------- shipping_rates
-- fee IS NULL means "not set yet": checkout refuses that governorate. No fee is invented.
create table public.shipping_rates (
  governorate text primary key,
  fee numeric(10, 2) check (fee is null or fee >= 0),
  updated_at timestamptz not null default now()
);
create trigger shipping_rates_updated_at before update on public.shipping_rates
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------- orders
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  number bigint generated always as identity (start with 1001) unique,
  customer_name text not null check (char_length(customer_name) between 2 and 120),
  phone text not null check (phone ~ '^01[0125][0-9]{8}$'),
  governorate text not null references public.shipping_rates (governorate) on update cascade,
  area text not null check (char_length(area) between 1 and 120),
  address text not null check (char_length(address) between 3 and 500),
  notes text check (notes is null or char_length(notes) <= 1000),
  payment_method text not null default 'cod' check (payment_method in ('cod')),
  status text not null default 'new'
    check (status in ('new', 'confirmed', 'printing', 'shipped', 'delivered', 'cancelled')),
  subtotal numeric(10, 2) not null check (subtotal >= 0),
  shipping numeric(10, 2) not null check (shipping >= 0),
  total numeric(10, 2) not null check (total >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index orders_status_created_idx on public.orders (status, created_at desc);
create index orders_phone_idx on public.orders (phone);
create index orders_created_idx on public.orders (created_at desc);
create trigger orders_updated_at before update on public.orders
  for each row execute function public.set_updated_at();

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  product_id uuid references public.products (id) on delete set null,
  name_snapshot text not null,
  mode text not null check (mode in ('standard', 'name', 'design')),
  text text,
  font text check (font is null or font in ('ruqaa', 'kufi', 'naskh', 'bold', 'modern')),
  design_path text,
  unit_price numeric(10, 2) not null check (unit_price >= 0),
  qty integer not null check (qty between 1 and 50),
  constraint order_items_mode_fields check (
    (mode = 'standard' and text is null and font is null and design_path is null)
    or (mode = 'name' and text is not null and char_length(text) between 1 and 18 and font is not null and design_path is null)
    or (mode = 'design' and design_path is not null and text is null and font is null)
  )
);
create index order_items_order_idx on public.order_items (order_id);

-- ---------------------------------------------------------------- newsletter
create table public.newsletter_subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null check (char_length(email) <= 254 and email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]{2,}$'),
  created_at timestamptz not null default now()
);
create unique index newsletter_subscribers_email_key on public.newsletter_subscribers (lower(email));

-- ---------------------------------------------------------------- create_order (atomic)
-- Called ONLY by server code with the service role, after the server has re-priced the cart.
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
    (order_id, product_id, name_snapshot, mode, text, font, design_path, unit_price, qty)
  select
    v_id,
    nullif(i ->> 'product_id', '')::uuid,
    i ->> 'name_snapshot',
    i ->> 'mode',
    nullif(i ->> 'text', ''),
    nullif(i ->> 'font', ''),
    nullif(i ->> 'design_path', ''),
    (i ->> 'unit_price')::numeric,
    (i ->> 'qty')::integer
  from jsonb_array_elements(p_items) as i;

  return jsonb_build_object('id', v_id, 'number', v_number);
end;
$$;

-- ---------------------------------------------------------------- privileges
-- Start from nothing, then grant exactly what the Data API roles need.
revoke all on table
  public.admins, public.categories, public.products, public.shipping_rates,
  public.orders, public.order_items, public.newsletter_subscribers
  from public, anon, authenticated;

grant select on public.categories, public.products, public.shipping_rates to anon, authenticated;
-- admin console (RLS below restricts every one of these to admins):
grant insert, update, delete on public.categories, public.products, public.shipping_rates to authenticated;
grant select, update on public.orders to authenticated;
grant select on public.order_items, public.newsletter_subscribers to authenticated;
grant select on public.admins to authenticated;

revoke all on function public.create_order(jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.create_order(jsonb, jsonb) to service_role;
revoke all on function public.grant_admin(text) from public, anon, authenticated;
grant execute on function public.grant_admin(text) to service_role;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated, service_role;

-- ---------------------------------------------------------------- row level security
alter table public.admins enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.shipping_rates enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.newsletter_subscribers enable row level security;

-- admins: an admin can see their own row; nobody can write through the API.
create policy admins_select_self on public.admins
  for select to authenticated using (user_id = (select auth.uid()));

-- catalog: public reads active rows only; admins do everything.
create policy categories_public_read on public.categories
  for select to anon, authenticated using (is_active);
create policy categories_admin_all on public.categories
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy products_public_read on public.products
  for select to anon, authenticated
  using (is_active and exists (select 1 from public.categories c where c.id = category_id and c.is_active));
create policy products_admin_all on public.products
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy shipping_public_read on public.shipping_rates
  for select to anon, authenticated using (true);
create policy shipping_admin_all on public.shipping_rates
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- orders: admins read + update (status). Inserts happen only via create_order (service role).
create policy orders_admin_select on public.orders
  for select to authenticated using (public.is_admin());
create policy orders_admin_update on public.orders
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy order_items_admin_select on public.order_items
  for select to authenticated using (public.is_admin());
create policy newsletter_admin_select on public.newsletter_subscribers
  for select to authenticated using (public.is_admin());
