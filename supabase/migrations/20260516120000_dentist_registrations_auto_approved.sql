-- Track which registrations were rubber-stamped by the auto-approval gate
-- in POST /api/registrations vs. an admin manually clicking Approve in the
-- admin panel. Defaults to false so legacy rows read as "manually approved" —
-- which is accurate, because the admin button was the only path to
-- status='approved' before this column existed.

alter table public.dentist_registrations
  add column if not exists auto_approved boolean not null default false;

-- Partial index so the admin "auto-approved" filter is cheap. Only ~5–20%
-- of approved rows are expected to clear the gate, so a full b-tree is wasted.
create index if not exists dentist_registrations_auto_approved_idx
  on public.dentist_registrations (auto_approved)
  where auto_approved = true;
