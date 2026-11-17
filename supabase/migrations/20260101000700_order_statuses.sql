begin;

set local lock_timeout = '5s';

alter table public.orders
  drop constraint orders_status_check,
  drop constraint if exists orders_return_reason_check,
  add column if not exists return_reason text default null;

alter table public.orders alter column return_reason set default null;

update public.orders
set status = 'prepared'
where status in ('confirmed', 'printing');

update public.orders
set return_reason = null
where status <> 'returned' and return_reason is not null;

alter table public.orders
  add constraint orders_status_check
    check (status in ('new', 'prepared', 'shipped', 'delivered', 'cancelled', 'returned')),
  add constraint orders_return_reason_check
    check (
      case when status = 'returned' then
        return_reason is not null
        and char_length(return_reason) <= 1000
        and return_reason ~ '[^[:space:]]'
      else return_reason is null
      end
    );

commit;
