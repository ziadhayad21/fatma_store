-- Suggestions become simple and public: every suggestion shows on the site right away, no moderation.
--
-- Non-destructive (the live site shares this database): nothing is dropped. is_read, status and
-- admin_reply stay until the cleanup migration (together with products.personalization_fee); the
-- code no longer uses them. Their column grants to anon also stay until then, because the code
-- deployed before this change still selects status / admin_reply (revoking would make its read fail).
begin;
set local lock_timeout = '5s';

-- visible by default, and every existing suggestion becomes visible
alter table public.suggestions alter column is_public set default true;
update public.suggestions set is_public = true where not is_public;

-- the public reads every suggestion (still only the granted columns: never id / order_id / is_read)
drop policy if exists suggestions_public_read on public.suggestions;
create policy suggestions_public_read on public.suggestions
  for select to anon using (true);

-- admins may delete a suggestion (spam, duplicates, …)
grant delete on public.suggestions to authenticated;
create policy suggestions_admin_delete on public.suggestions
  for delete to authenticated using (public.is_admin());

commit;
