-- 1) Public, moderated suggestions  2) "اصنعها بنفسك" (DIY) products.
--
-- Additive only (the live site shares this database): new columns with defaults, new grants and
-- policies, two hidden products and one sample suggestion. Nothing is dropped, renamed or rewritten.
begin;
set local lock_timeout = '5s';

-- ---------------------------------------------------------------- suggestions: moderation columns
alter table public.suggestions
  add column is_public boolean not null default false,
  add column status text not null default 'new' check (status in ('new', 'reviewing', 'done')),
  add column admin_reply text check (admin_reply is null or (char_length(admin_reply) between 1 and 300));

create index suggestions_public_idx on public.suggestions (created_at desc) where is_public;

-- The public (anon) may read ONLY these columns, and only rows the admin made public.
-- No grant on id / order_id / is_read / is_public. Admins keep their table-wide grant (authenticated).
grant select (text, status, admin_reply, created_at) on public.suggestions to anon;

create policy suggestions_public_read on public.suggestions
  for select to anon using (is_public);

-- The existing guard (suggestions_guard) already keeps text / order_id / created_at / id fixed and
-- lets admins change every other column, so it needs no change for is_public / status / admin_reply.

-- sample public suggestion (once)
insert into public.suggestions (text, is_read, is_public, status, admin_reply)
select 'عايزين تضيفوا مريلة أطفال بأسامي الولاد', true, true, 'reviewing', 'فكرة حلوة! بندرسها دلوقتي.'
where not exists (select 1 from public.suggestions where text = 'عايزين تضيفوا مريلة أطفال بأسامي الولاد');

-- ---------------------------------------------------------------- products: DIY flag
alter table public.products add column is_diy boolean not null default false;

-- Two DIY products, HIDDEN (is_active = false) until the owner sets real prices and shows them.
-- 999 is a placeholder price. The products_sync_colors trigger gives each one every active colour
-- at that price.
insert into public.products (slug, name_ar, category_id, description_ar, details_ar, care_ar, base_price, images, is_active, sort, is_diy)
select v.slug, v.name_ar, c.id, v.description_ar, v.details_ar, v.care_ar, 999, '[]'::jsonb, false, -1, true
from (values
  ('diy-apron', 'اصنع مريلتك بنفسك', 'aprons',
   'مريلة سادة جاهزة لتصميمك: ارفع رسمتك أو اللوجو بتاعك، أو اكتب الاسم اللي تحبه.',
   'مريلة مطبخ قماش بجيب وأربطة طويلة، بنطبع عليها تصميمك أو الاسم اللي تختاره.',
   'تغسل بماء بارد أو دافئ حتى 40 درجة، وتكوى على الظهر للحفاظ على الطباعة.'),
  ('diy-towel', 'اصنع فوطتك بنفسك', 'towels',
   'فوطة سادة جاهزة لتصميمك: ارفع رسمتك أو صورتك، أو اكتب الاسم اللي تحبه.',
   'فوطة مطبخ قطن عالية الامتصاص، بنطبع عليها تصميمك أو الاسم اللي تختاره.',
   'تغسل بماء بارد أو دافئ حتى 40 درجة، وتكوى على الظهر للحفاظ على الطباعة.')
) as v (slug, name_ar, category_slug, description_ar, details_ar, care_ar)
join public.categories c on c.slug = v.category_slug
on conflict (slug) do nothing;

commit;
