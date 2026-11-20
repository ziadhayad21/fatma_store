# Pending cleanup migration

The live site shares this database, so removals are never shipped together with the code change
that stops using them. They wait here until the new code has been live for a while, then go into
**one** cleanup migration (push with `npm run db:push`).

Before writing it: check that the deployed code no longer reads any of these, and update
`src/db/rls.test.ts` (it still covers the newsletter table and the old suggestion columns).

## To drop

| What | Why it is unused | Since |
| --- | --- | --- |
| `products.personalization_fee` | the printing fee was removed; the code ignores the column | colours migration (…1200) |
| `suggestions.status`, `suggestions.admin_reply` (and their `anon` column grants) | suggestions are public without moderation; the grants stayed only for code that was live then | …1500 |
| `suggestions.is_read`, `suggestions.is_public` | read/unread and the public toggle were removed from the admin; every suggestion is public | …1500 |
| `newsletter_subscribers` (table, index `newsletter_subscribers_email_key`, policy `newsletter_admin_select`, grants) | the newsletter / subscribers feature was removed from the site and the admin (0 rows at removal) | newsletter removal |

## Data that stays as is

- `order_items.color_name` keeps the colour name at the time of the order (pink orders before the
  rename say "وردي"; the colour is now called "بينك").
