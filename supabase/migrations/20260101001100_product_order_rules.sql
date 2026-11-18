begin;
set local lock_timeout = '5s';

alter table public.order_items add column color text check (color in ('black', 'white', 'pink'));
alter table public.order_items drop constraint order_items_mode_fields;
alter table public.order_items add constraint order_items_mode_fields check (
  (mode = 'standard' and text is null and font is null and design_path is null)
  or (mode = 'name' and text is not null and char_length(text) between 1 and 18 and (font is not null or color is not null) and design_path is null)
  or (mode = 'design' and design_path is not null and text is null and font is null)
);

alter table public.orders
  add column customization_notes text check (char_length(customization_notes) <= 1000),
  add column deposit_amount numeric(10,2) not null default 0,
  add column deposit_status text check (deposit_status in ('pending', 'submitted', 'confirmed')),
  add column deposit_method text check (deposit_method in ('instapay', 'wallet')),
  add column payment_proof_path text unique,
  add column deposit_confirmed_at timestamptz,
  add column deposit_confirmed_by uuid references auth.users(id),
  add constraint orders_deposit_fields check (
    (deposit_status is null and deposit_amount = 0 and deposit_method is null and payment_proof_path is null and deposit_confirmed_at is null and deposit_confirmed_by is null)
    or (deposit_status is not null and deposit_amount = round(total * 0.3, 2) and deposit_method is not null
      and (deposit_status = 'pending' or payment_proof_path is not null)
      and (deposit_status <> 'confirmed' or (deposit_confirmed_at is not null and deposit_confirmed_by is not null)))
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('payment-proofs', 'payment-proofs', false, 10485760, array['image/png','image/jpeg','image/webp']);
create policy payment_proofs_admin_select on storage.objects for select to authenticated
  using (bucket_id = 'payment-proofs' and public.is_admin());

-- Enforce the payment gate for all admin status updates, including direct API writes.
create function public.guard_order_deposit() returns trigger language plpgsql set search_path = '' as $$
begin
  if old.deposit_status is not null then
    if new.deposit_status is null or new.deposit_amount <> old.deposit_amount or new.total <> old.total
       or new.payment_proof_path is distinct from old.payment_proof_path or new.deposit_method is distinct from old.deposit_method then
      raise exception 'deposit details cannot be removed or changed';
    end if;
    if new.deposit_status = 'confirmed' and old.deposit_status <> 'confirmed' then
      if not public.is_admin() or old.deposit_status <> 'submitted' or new.payment_proof_path is null then
        raise exception 'only an admin can verify a submitted deposit';
      end if;
      new.deposit_confirmed_at := now();
      new.deposit_confirmed_by := auth.uid();
    elsif old.deposit_status = 'confirmed' then
      if new.deposit_status <> 'confirmed' then raise exception 'confirmed deposit cannot be reverted'; end if;
      new.deposit_confirmed_at := old.deposit_confirmed_at;
      new.deposit_confirmed_by := old.deposit_confirmed_by;
    end if;
    if new.status in ('prepared','shipped','delivered','returned') and new.deposit_status <> 'confirmed' then
      raise exception 'verify deposit before fulfilling order';
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function public.guard_order_deposit() from public, anon, authenticated;
create trigger orders_deposit_guard before update on public.orders for each row execute function public.guard_order_deposit();

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
    where (c.slug = 'bags' and (i->>'mode' <> 'standard' or nullif(i->>'color','') is not null))
      or (c.slug in ('aprons','towels') and (coalesce(i->>'color','') not in ('black','white','pink') or nullif(i->>'font','') is not null))
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
    (order_id, product_id, name_snapshot, mode, text, font, design_path, unit_price, qty, original_unit_price, discount_percent, color)
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
    nullif(i ->> 'color', '')
  from jsonb_array_elements(p_items) as i;

  return jsonb_build_object('id', v_id, 'number', v_number);
end;
$$;

revoke all on function public.create_order(jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.create_order(jsonb, jsonb) to service_role;

commit;
