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

## TODO: Email typo detection on registration

Warn before saving if the email domain matches a common typo — `gmai.com`,
`gamil.com`, `gnail.com`, `yaho.com`, `hotmial.com`, `outlok.com` — and show a
"Did you mean gmail.com?" prompt. Prevents the `@gmai.com` class of support
tickets (dentist registers under a typo'd domain, then can't be matched to her
confirmed `auth.users` login and appears locked out of the dashboard).

## TODO: Duplicate phone / email check on registration

If a registering dentist's phone number already exists in the `dentists` table,
show "A profile with this number already exists. Login instead →" and redirect to
`/for-dentists/login`. Do the same check for email — if the email already exists,
redirect to login. Prevents duplicate registrations when a dentist assumes the
first attempt failed and registers again.

## TODO: Make admin data fixes on `dentists` reliable (RLS write trap)

**Original hypothesis (recorded, but NOT confirmed):** "the Supabase SQL editor
runs as anon and RLS silently blocks UPDATEs on `dentists`." Investigation today
did not support this:
- The SQL editor runs as the `postgres` superuser by default, which **bypasses
  RLS** — anon-role policies shouldn't apply there. (Worth confirming in project
  settings; some setups expose a per-query role selector.)
- The Priyanka email fix **succeeded** (`af2b7ac3`: `@gmai.com` → `@gmail.com`,
  verified live) — so that write path was not RLS-blocked.
- The onboarding backfill shows all 131 rows still `onboarding_completed = false`,
  but that's consistent with the `UPDATE` not having been run yet (only the
  `ALTER` was), not a silent failure.

**The real, verified trap (different mechanism):** the app's **user-bound**
client (authenticated dentist JWT via PostgREST) is silently filtered by the
`Dentists update own dentists row` policy (`using`/`with check` = `email =
auth.jwt() ->> 'email'`). A non-matching `UPDATE` returns HTTP 200 with an empty
array — 0 rows, no error. This is the "Saved! but nothing changed" trap from
migration `20260516160000`. Newer code mitigates it by chaining `.select()`
after `.update()` so a zero-row write is observable.

**Actions:**
- Confirm what role the SQL editor uses; if genuinely restricted, switch it to
  `postgres`/`service_role` or add an admin bypass function.
- For scripted/admin data fixes, always use the **service-role key** (bypasses
  RLS) — never a user-bound client.
- Audit remaining `.update()` calls on `dentists` that lack a `.select()` guard
  and add one so RLS-filtered writes surface instead of reporting false success.
