-- Staff RLS: grant active clinic_staff members the same data access as the
-- owner dentist, scoped to their clinic. Role-based UI gating (Reception vs
-- Associate Dentist) lives in the dashboard shell — this migration just
-- makes the rows reachable so the pages don't render empty.
--
-- Sibling policies: existing owner policies are left alone, and these are
-- added with distinct names. RLS evaluates multiple PERMISSIVE policies as
-- OR, so the owner's existing matcher still works and staff get an
-- additional match path through dentist_id_for_active_staff().

create or replace function public.dentist_id_for_active_staff()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select dentist_id
  from public.clinic_staff
  where lower(email) = lower(auth.jwt() ->> 'email')
    and status = 'active'
  limit 1;
$$;

grant execute on function public.dentist_id_for_active_staff() to authenticated;

-- Owner's dentists row — needed by the dashboard layout so it can render
-- the clinic name, slug, profile photo, etc. Read-only; writes stay
-- gated to the existing "Dentists update own dentists row" policy.
drop policy if exists "Staff reads owner dentist row" on public.dentists;
create policy "Staff reads owner dentist row" on public.dentists for select
  to authenticated
  using (id = public.dentist_id_for_active_staff());

-- Per-clinic tables: same shape across the dashboard pages staff need to
-- reach (Appointments, Patients, Billing, Calendar, EMR Templates,
-- Treatments). Each has a dentist_id column scoping it to one clinic.
do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'appointments',
    'patients',
    'invoices',
    'dentist_treatments',
    'emr_templates'
  ] loop
    execute format('drop policy if exists "Staff manages clinic data" on public.%I', tbl);
    execute format($pol$
      create policy "Staff manages clinic data" on public.%1$I for all
        to authenticated
        using (dentist_id = public.dentist_id_for_active_staff())
        with check (dentist_id = public.dentist_id_for_active_staff())
    $pol$, tbl);
  end loop;
end $$;
