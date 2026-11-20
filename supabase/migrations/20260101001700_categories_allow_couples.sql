-- Couples ("كابلز") products only in categories that allow them. Additive: one new column with a
-- default; المريلات (aprons) allows them (its two couples products already live there).
begin;
set local lock_timeout = '5s';

alter table public.categories add column allows_couples boolean not null default false;
update public.categories set allows_couples = true where slug = 'aprons';

commit;
