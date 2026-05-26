-- Clinic expense ledger + staff salary records — both feed the P&L view
-- on /dashboard/analytics and the operational page at /dashboard/expenses.
--
-- clinic_expenses:
--   One row per spend, tagged with a constrained category (the dashboard
--   pill filter is exactly these six). location_id is nullable so single-
--   branch dentists don't need to set it; on multi-branch clinics it lets
--   the P&L scope per branch later. is_recurring flags fixed monthly costs
--   (rent/EMI/subscriptions) so the dashboard can mark them with a 🔄
--   badge — semantic only, no automation off this flag.
--
-- staff_salaries:
--   One row per (staff_id, month, year). net_payable is stored (not a
--   generated column) so PostgREST + the P&L view read it without re-doing
--   the arithmetic; the API recomputes it on every insert/update so the
--   stored value can't drift. status defaults to 'pending' and flips to
--   'paid' via the Mark-Paid action, which also sets paid_date +
--   payment_mode.
--
-- Both tables follow the email-on-dentists RLS pattern shared by lab_work,
-- patient_images, perio_charts, etc.

create table if not exists public.clinic_expenses (
  id           uuid primary key default gen_random_uuid(),
  dentist_id   uuid not null references public.dentists(id) on delete cascade,
  location_id  uuid references public.clinic_locations(id) on delete set null,
  category     text not null,
  description  text,
  amount       numeric not null,
  expense_date date not null,
  is_recurring boolean not null default false,
  payment_mode text,
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint clinic_expenses_category_check
    check (category in ('rent_emi','utilities','marketing','equipment','lab_work','miscellaneous')),
  constraint clinic_expenses_amount_positive
    check (amount > 0)
);

create index if not exists clinic_expenses_dentist_date_idx
  on public.clinic_expenses (dentist_id, expense_date desc);
create index if not exists clinic_expenses_dentist_category_idx
  on public.clinic_expenses (dentist_id, category);

create or replace function public.clinic_expenses_set_updated_at()
returns trigger as $$
begin
  new.updated_at := now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists clinic_expenses_updated_at on public.clinic_expenses;
create trigger clinic_expenses_updated_at
  before update on public.clinic_expenses
  for each row execute function public.clinic_expenses_set_updated_at();

alter table public.clinic_expenses enable row level security;

drop policy if exists "Dentists manage own clinic_expenses" on public.clinic_expenses;
create policy "Dentists manage own clinic_expenses"
  on public.clinic_expenses
  for all
  using (
    dentist_id in (select id from public.dentists where email = auth.jwt() ->> 'email')
  )
  with check (
    dentist_id in (select id from public.dentists where email = auth.jwt() ->> 'email')
  );


create table if not exists public.staff_salaries (
  id           uuid primary key default gen_random_uuid(),
  dentist_id   uuid not null references public.dentists(id) on delete cascade,
  staff_id     uuid not null references public.clinic_staff(id) on delete cascade,
  month        smallint not null,
  year         smallint not null,
  basic_pay    numeric not null default 0,
  allowances   numeric not null default 0,
  bonus        numeric not null default 0,
  deductions   numeric not null default 0,
  net_payable  numeric not null default 0,
  status       text not null default 'pending',
  payment_mode text,
  paid_date    date,
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint staff_salaries_month_check  check (month between 1 and 12),
  constraint staff_salaries_year_check   check (year between 2000 and 2100),
  constraint staff_salaries_status_check check (status in ('pending','paid')),
  constraint staff_salaries_unique_per_month unique (staff_id, month, year)
);

create index if not exists staff_salaries_dentist_period_idx
  on public.staff_salaries (dentist_id, year, month);

create or replace function public.staff_salaries_set_updated_at()
returns trigger as $$
begin
  new.updated_at := now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists staff_salaries_updated_at on public.staff_salaries;
create trigger staff_salaries_updated_at
  before update on public.staff_salaries
  for each row execute function public.staff_salaries_set_updated_at();

alter table public.staff_salaries enable row level security;

drop policy if exists "Dentists manage own staff_salaries" on public.staff_salaries;
create policy "Dentists manage own staff_salaries"
  on public.staff_salaries
  for all
  using (
    dentist_id in (select id from public.dentists where email = auth.jwt() ->> 'email')
  )
  with check (
    dentist_id in (select id from public.dentists where email = auth.jwt() ->> 'email')
  );
