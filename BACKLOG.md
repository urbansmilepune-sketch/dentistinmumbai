# Backlog

Tracked-but-not-yet-built work. Pick items up as capacity allows.

## TODO: `scripts/schema-audit.mjs` — migration ⇄ live-DB drift detector

**Problem.** The Supabase CLI isn't linked (no DB password), so `db push` can't
run and migrations are reconstructed as no-ops. That lets live-DB schema drift
away from what the migration files declare. This session alone we hit it
repeatedly: `email_otps`, `clinic_staff.user_id`, `treatment_plans` columns,
`clinic_expenses.location_id`, and `inventory_items.min_stock_level` /
`supplier_name` / `unit_cost` — all declared but missing from live, surfacing as
opaque runtime errors.

**Ask.** Build a script that compares every migration file in
`supabase/migrations/` against the live DB schema (read via PostgREST using the
`.env.local` service-role key) and reports what's missing from live.

**Should report:**
- Tables declared in migrations but absent from live.
- Columns declared but absent from live (per table).
- Constraints / indexes declared but absent (best-effort — PostgREST exposes
  columns easily; constraints may need an `information_schema` view or an RPC).

**Notes / prior art:**
- PostgREST can read live column existence quickly: probe
  `GET /rest/v1/<table>?select=<col>&limit=1`; a missing column returns code
  `42703`. This is how drift was diagnosed manually this session.
- Parsing SQL migrations is the hard part — a full parser is overkill; start with
  regex extraction of `CREATE TABLE` / `ALTER TABLE ... ADD COLUMN` statements.
- Output should be a plain list of missing items with the `ALTER TABLE` SQL to
  run manually in the Supabase SQL editor (we apply schema changes out-of-band).
- Keep it read-only against live — never mutate.
