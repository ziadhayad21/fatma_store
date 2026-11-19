-- Customer suggestions (الاقتراحات), sent from the order-success popup.
-- Additive only: one new table, nothing existing is changed.
-- Inserts happen only in the server action (service role, after validation + rate limiting);
-- anon/authenticated cannot insert; only admins can read and mark as read.
begin;
set local lock_timeout = '5s';

create table public.suggestions (
  id uuid primary key default gen_random_uuid(),
  text text not null check (char_length(text) between 1 and 500 and text ~ '[^[:space:]]'),
  order_id uuid references public.orders (id) on delete set null,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);
create index suggestions_created_idx on public.suggestions (created_at desc);
create index suggestions_unread_idx on public.suggestions (created_at desc) where not is_read;
create index suggestions_order_idx on public.suggestions (order_id) where order_id is not null;

revoke all on table public.suggestions from public, anon, authenticated;
grant select, update on public.suggestions to authenticated;

alter table public.suggestions enable row level security;

create policy suggestions_admin_select on public.suggestions
  for select to authenticated using (public.is_admin());
create policy suggestions_admin_update on public.suggestions
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- Admins may only flip is_read; the text and its order link stay as the customer sent them.
-- (order_id may still become null: that is the foreign key's ON DELETE SET NULL when an order is deleted.)
create function public.guard_suggestion_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.text is distinct from old.text
     or (new.order_id is distinct from old.order_id and new.order_id is not null)
     or new.created_at is distinct from old.created_at or new.id is distinct from old.id then
    raise exception 'only is_read can change';
  end if;
  return new;
end;
$$;
revoke execute on function public.guard_suggestion_update() from public, anon, authenticated;
create trigger suggestions_guard before update on public.suggestions
  for each row execute function public.guard_suggestion_update();

commit;
