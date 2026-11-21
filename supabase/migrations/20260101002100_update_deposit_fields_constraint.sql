-- Migration to replace hardcoded 30% check in orders_deposit_fields constraint
-- to support flexible deposit_percent (1..100)

begin;

alter table public.orders
  drop constraint if exists orders_deposit_fields;

alter table public.orders
  add constraint orders_deposit_fields check (
    (deposit_status is null and deposit_amount = 0 and deposit_method is null and payment_proof_path is null and deposit_confirmed_at is null and deposit_confirmed_by is null and deposit_percent is null)
    or (deposit_status is not null
      and deposit_percent between 1 and 100
      and deposit_amount = round(total * (deposit_percent::numeric / 100.0), 2)
      and deposit_method is not null
      and (deposit_status = 'pending' or payment_proof_path is not null)
      and (deposit_status <> 'confirmed' or (deposit_confirmed_at is not null and deposit_confirmed_by is not null)))
  );

commit;
