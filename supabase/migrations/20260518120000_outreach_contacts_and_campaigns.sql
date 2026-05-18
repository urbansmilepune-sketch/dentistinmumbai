-- Cold-email outreach tables. Two relations:
--
--   outreach_contacts   — per-prospect rows, populated from CSV uploads.
--                         status walks pending → sent → opened → clicked →
--                         registered. The latter is reached when a dentist
--                         submits dentist_registrations with a matching email
--                         (see trigger at bottom of file).
--
--   outreach_campaigns  — one row per blast. Counts (sent_count/open_count/
--                         click_count/registration_count) are denormalised
--                         summaries that the send + tracking routes bump
--                         atomically; the contact-level columns remain the
--                         source of truth.
--
-- Both tables are admin-managed and live behind a service-role write surface.
-- No public read policy — admin queries go through the service-role client.

create table if not exists public.outreach_contacts (
  id                uuid primary key default gen_random_uuid(),
  name              text,
  clinic_name       text,
  email             text not null,
  phone             text,
  city              text,
  area              text,
  source            text,
  status            text not null default 'pending',
  campaign_id       uuid,
  sent_at           timestamptz,
  opened_at         timestamptz,
  clicked_at        timestamptz,
  registered_at     timestamptz,
  created_at        timestamptz not null default now(),
  constraint outreach_contacts_status_check
    check (status in ('pending', 'sent', 'opened', 'clicked', 'registered', 'bounced', 'unsubscribed'))
);

-- Email is the dedupe key the upload route + registration trigger key off.
-- Indexing it case-insensitively keeps the lookup path the same regardless of
-- whether the CSV mixes cases.
create unique index if not exists outreach_contacts_email_unique_idx
  on public.outreach_contacts (lower(email));

create index if not exists outreach_contacts_city_idx
  on public.outreach_contacts (city);

create index if not exists outreach_contacts_status_idx
  on public.outreach_contacts (status);

create index if not exists outreach_contacts_campaign_idx
  on public.outreach_contacts (campaign_id);


create table if not exists public.outreach_campaigns (
  id                    uuid primary key default gen_random_uuid(),
  name                  text not null,
  city                  text,
  subject               text not null,
  body                  text not null,
  total_contacts        int not null default 0,
  sent_count            int not null default 0,
  open_count            int not null default 0,
  click_count           int not null default 0,
  registration_count    int not null default 0,
  status                text not null default 'draft',
  created_at            timestamptz not null default now(),
  sent_at               timestamptz,
  constraint outreach_campaigns_status_check
    check (status in ('draft', 'sending', 'paused', 'sent', 'failed'))
);

create index if not exists outreach_campaigns_city_idx
  on public.outreach_campaigns (city);

create index if not exists outreach_campaigns_created_at_idx
  on public.outreach_campaigns (created_at desc);


-- RLS — service role writes from the admin API routes. No public policies.
alter table public.outreach_contacts   enable row level security;
alter table public.outreach_campaigns  enable row level security;


-- When a dentist completes the registration form with an email that matches a
-- contact we've previously cold-emailed, mark that contact as `registered` and
-- bump the campaign's registration_count. Matched on lower(email) to mirror
-- the unique index above. Idempotent — flipping a row that's already in the
-- registered state re-fires the count bump only if the row genuinely
-- transitions to registered, so re-sends of the same registration row don't
-- inflate the counter.

create or replace function public.outreach_mark_registered_from_dentist_registration()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_campaign uuid;
  v_was_registered boolean;
begin
  if new.email is null then
    return new;
  end if;

  -- Lock the matching contact row (if any) so the campaign count update is
  -- consistent under concurrent registration inserts.
  select campaign_id, status = 'registered'
    into v_campaign, v_was_registered
    from public.outreach_contacts
   where lower(email) = lower(new.email)
   for update;

  if not found then
    return new;
  end if;

  update public.outreach_contacts
     set status        = 'registered',
         registered_at = coalesce(registered_at, now())
   where lower(email) = lower(new.email);

  if v_campaign is not null and not coalesce(v_was_registered, false) then
    update public.outreach_campaigns
       set registration_count = registration_count + 1
     where id = v_campaign;
  end if;

  return new;
end;
$$;

drop trigger if exists outreach_match_on_registration_insert on public.dentist_registrations;
create trigger outreach_match_on_registration_insert
  after insert on public.dentist_registrations
  for each row
  execute function public.outreach_mark_registered_from_dentist_registration();
