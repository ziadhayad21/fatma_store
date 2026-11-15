-- 1) per-category hover colour for the home-page tiles (editable in the admin)
alter table public.categories
  add column if not exists accent_color text not null default '#EFE6D6'
  check (accent_color ~ '^#[0-9A-Fa-f]{6}$');

update public.categories set accent_color = '#EFE6D6' where slug = 'towels';
update public.categories set accent_color = '#F6D6DC' where slug = 'aprons';
update public.categories set accent_color = '#F2C94C' where slug = 'bags';

-- 2) customer reviews (real ones only; entered by an admin). The home page hides the section until 3 are published.
create table if not exists public.reviews (
  id            uuid primary key default gen_random_uuid(),
  customer_name text not null check (char_length(customer_name) between 1 and 80),
  text          text not null check (char_length(text) between 1 and 600),
  product_id    uuid references public.products (id) on delete set null,
  avatar_color  text check (avatar_color is null or avatar_color ~ '^#[0-9A-Fa-f]{6}$'),
  is_published  boolean not null default false,
  sort          integer not null default 0,
  created_at    timestamptz not null default now()
);
create index if not exists reviews_published_sort_idx on public.reviews (is_published, sort, created_at desc);

revoke all on table public.reviews from public, anon, authenticated;
grant select on public.reviews to anon, authenticated;
grant insert, update, delete on public.reviews to authenticated;

alter table public.reviews enable row level security;
-- the public sees published reviews only; admins manage everything
create policy reviews_public_read on public.reviews
  for select to anon, authenticated using (is_published);
create policy reviews_admin_all on public.reviews
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
