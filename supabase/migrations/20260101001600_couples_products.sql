-- "كابلز" (couples) products: one product = 2 pieces, each configured separately, one fixed price.
--
-- Additive (the live site shares this database):
--  * new columns with defaults / nullable; nothing dropped, renamed or rewritten;
--  * create_order keeps the same payload and rules; it additionally stores items[].pieces when sent
--    (code deployed before this migration never sends it, so its orders are unchanged);
--  * a helper for "is this uploaded design used by an order?" that also looks inside pieces;
--  * two hidden couples products.
begin;
set local lock_timeout = '5s';

-- ---------------------------------------------------------------- products
alter table public.products
  add column pieces_count integer not null default 1 check (pieces_count between 1 and 2),
  add column piece_labels jsonb check (
    piece_labels is null
    or (jsonb_typeof(piece_labels) = 'array' and jsonb_array_length(piece_labels) <= 2)
  );

-- ---------------------------------------------------------------- order items: per-piece snapshot
-- [{ "label", "color", "color_name", "text", "font", "design_path", "design_name" }, …]
-- The item's own text / color / design_path keep piece 1, so every older view still shows something sensible.
alter table public.order_items
  add column pieces jsonb check (
    pieces is null
    or (jsonb_typeof(pieces) = 'array' and jsonb_array_length(pieces) between 2 and 4)
  );

-- ---------------------------------------------------------------- uploads still referenced by an order
-- Used by the daily cleanup and by "remove my upload": a design is kept when any order item uses it,
-- as its design_path or inside its pieces.
create function public.design_paths_in_use(p_paths text[])
returns setof text
language sql
stable
set search_path = ''
as $$
  select distinct p
  from unnest(p_paths) as p
  where exists (select 1 from public.order_items i where i.design_path = p)
     or exists (
       select 1 from public.order_items i, jsonb_array_elements(i.pieces) e
       where i.pieces is not null and e ->> 'design_path' = p
     );
$$;
revoke all on function public.design_paths_in_use(text[]) from public, anon, authenticated;
grant execute on function public.design_paths_in_use(text[]) to service_role;

-- ---------------------------------------------------------------- create_order: + pieces
-- Identical to migration …1200 except the order_items insert also stores items[].pieces (array or null).
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
      -- pieces only for couples products, exactly one per piece
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

-- ---------------------------------------------------------------- two couples aprons, HIDDEN until checked
-- 650 for the pair. The products_sync_colors trigger makes all three colours available (their
-- prices are ignored for couples products: the pair has one fixed price).
insert into public.products (slug, name_ar, category_id, description_ar, details_ar, care_ar, base_price, images, is_active, sort, pieces_count, piece_labels)
select v.slug, v.name_ar, c.id, v.description_ar, v.details_ar, v.care_ar, 650, '[]'::jsonb, false, 0, 2,
       '["المريلة الأولى", "المريلة التانية"]'::jsonb
from (values
  ('couples-apron-chef-mouse', 'مريلة كابلز الفار الطباخ',
   'مريلتين متطابقتين برسمة الفار الطباخ، لكل واحدة لونها واسمها أو تصميمها.',
   'طقم من مريلتين قماش بجيب وأربطة طويلة. اختاروا لون كل مريلة، واكتبوا أساميكم أو ارفعوا تصميمكم.',
   'تغسل بماء بارد أو دافئ حتى 40 درجة، وتكوى على الظهر للحفاظ على الطباعة.'),
  ('couples-apron-teddy', 'مريلة كابلز دبدوب',
   'مريلتين برسمة الدبدوب للكابلز، لكل واحدة لونها واسمها أو تصميمها.',
   'طقم من مريلتين قماش بجيب وأربطة طويلة. اختاروا لون كل مريلة، واكتبوا أساميكم أو ارفعوا تصميمكم.',
   'تغسل بماء بارد أو دافئ حتى 40 درجة، وتكوى على الظهر للحفاظ على الطباعة.')
) as v (slug, name_ar, description_ar, details_ar, care_ar)
join public.categories c on c.slug = 'aprons'
on conflict (slug) do nothing;

commit;
