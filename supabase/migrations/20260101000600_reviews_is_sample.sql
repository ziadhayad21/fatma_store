-- Marks placeholder reviews so the admin can remove them all at once ("Delete all sample reviews").
alter table public.reviews add column if not exists is_sample boolean not null default false;
