begin;

set local lock_timeout = '5s';

alter table public.order_items add column product_image_snapshot jsonb;

-- Older orders can only be backfilled from the product photo still in the catalog.
update public.order_items item
set product_image_snapshot = product.images -> 0
from public.products product
where product.id = item.product_id
  and jsonb_typeof(product.images -> 0) = 'object'
  and nullif(product.images -> 0 ->> 'src', '') is not null;

create function public.snapshot_order_item_product_image()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  select product.images -> 0 into new.product_image_snapshot
  from public.products product
  where product.id = new.product_id
    and jsonb_typeof(product.images -> 0) = 'object'
    and nullif(product.images -> 0 ->> 'src', '') is not null;
  return new;
end;
$$;

revoke execute on function public.snapshot_order_item_product_image() from public, anon, authenticated;

create trigger order_items_snapshot_product_image
before insert on public.order_items
for each row execute function public.snapshot_order_item_product_image();

commit;
