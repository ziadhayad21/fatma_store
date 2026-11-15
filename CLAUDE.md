# Working rules for this project

@AGENTS.md

## How much to verify

- **Small changes** (copy, links, styling, a single feature): run only `npx eslint .`, `npx tsc --noEmit`, and the ONE check that relates to what you changed (for example `scripts/pages-check.mjs` for header/links/product pages, `scripts/keyboard-check.mjs` for focus/drawers, `npm test` for pure logic).
- **Do not** run Lighthouse (`scripts/lighthouse.mjs`) or the full regression set (behavior / personalization / edit-flow / axe / keyboard / visual-pass / admin-live / e2e-live / ratelimit-live) unless the user asks, or right before a deploy.
- **Before a deploy**: run the full set once against a normal `npm run build` + `next start -p 3111`.
- Never judge performance on a build made with `next build --debug-prerender`: that flag disables minification and makes Lighthouse look much worse.

## Standing rules from the user

- Ask before changing the visual design, adding paid services, or deciding prices, shipping fees or policies.
- Never turn off Cache Components without telling the user first.
- Secrets (`SUPABASE_SECRET_KEY`, `SUPABASE_DB_PASSWORD`) stay in `.env.local` / Vercel only; never print them or commit them.
- Applying a migration to the hosted (production) database needs the user's confirmation: tell them to run `npm run db:push`.
