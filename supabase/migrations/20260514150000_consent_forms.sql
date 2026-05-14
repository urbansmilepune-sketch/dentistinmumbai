-- Digital consent forms (informed consent for procedures). One row per
-- signed form; form_content stores a snapshot of the text the patient
-- actually agreed to so future edits to the template don't rewrite history.
-- patient_signature is the base64 PNG produced by the canvas signature pad
-- on the client — kept inline rather than in storage so the PDF re-render
-- doesn't need a second round-trip.

create table if not exists public.consent_forms (
  id                 uuid primary key default gen_random_uuid(),
  dentist_id         uuid not null references public.dentists(id) on delete cascade,
  patient_id         uuid not null references public.patients(id) on delete cascade,
  form_type          text not null,
  form_content       jsonb not null,
  patient_signature  text,
  signed_at          timestamptz,
  created_at         timestamptz not null default now(),
  constraint consent_forms_form_type_check
    check (form_type in ('implant', 'extraction', 'rct', 'whitening', 'custom'))
);

create index if not exists consent_forms_patient_idx on public.consent_forms (patient_id);
create index if not exists consent_forms_dentist_idx on public.consent_forms (dentist_id);

-- RLS: same email-on-dentists pattern the rest of the project uses.
alter table public.consent_forms enable row level security;

drop policy if exists "Dentists read their own consent forms" on public.consent_forms;
create policy "Dentists read their own consent forms"
  on public.consent_forms
  for select
  using (
    dentist_id in (
      select id from public.dentists where email = auth.jwt() ->> 'email'
    )
  );

drop policy if exists "Dentists insert their own consent forms" on public.consent_forms;
create policy "Dentists insert their own consent forms"
  on public.consent_forms
  for insert
  with check (
    dentist_id in (
      select id from public.dentists where email = auth.jwt() ->> 'email'
    )
  );
