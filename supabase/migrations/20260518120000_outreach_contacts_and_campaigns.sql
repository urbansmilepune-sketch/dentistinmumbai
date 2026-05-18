-- Cold-email outreach tables.
--
--   outreach_campaigns — one row per blast. Counts (sent_count / open_count /
--                        click_count / registration_count) are denormalised
--                        summaries that the send + tracking routes bump
--                        atomically; the contact rows remain the source of
--                        truth for per-recipient state.
--
--   outreach_contacts  — per-prospect rows, populated from CSV uploads. The
--                        status enum is intentionally small (pending / sent /
--                        bounced / unsubscribed); per-recipient engagement is
--                        captured by the opened_at / clicked_at / registered_at
--                        timestamps so a single contact can be "sent" AND
--                        "opened" AND "clicked" without the enum exploding.
--
-- campaigns is created first because contacts.campaign_id has a FK pointing
-- at it.
--
-- RLS is enabled on both tables with NO public policies; every read/write
-- goes through the service-role client in the admin API routes.

create table if not exists public.outreach_campaigns (
  id                    uuid primary key default gen_random_uuid(),
  name                  text not null,
  city                  text,
  subject               text not null,
  body                  text not null,
  status                text not null default 'draft',
  total_contacts        int not null default 0,
  sent_count            int not null default 0,
  open_count            int not null default 0,
  click_count           int not null default 0,
  registration_count    int not null default 0,
  created_at            timestamptz not null default now(),
  sent_at               timestamptz,
  constraint outreach_campaigns_status_check
    check (status in ('draft', 'sending', 'sent', 'paused'))
);

create index if not exists outreach_campaigns_city_idx
  on public.outreach_campaigns (city);
create index if not exists outreach_campaigns_created_at_idx
  on public.outreach_campaigns (created_at desc);


create table if not exists public.outreach_contacts (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  clinic_name     text,
  email           text unique,
  city            text,
  status          text not null default 'pending',
  campaign_id     uuid references public.outreach_campaigns(id) on delete set null,
  sent_at         timestamptz,
  opened_at       timestamptz,
  clicked_at      timestamptz,
  registered_at   timestamptz,
  created_at      timestamptz not null default now(),
  constraint outreach_contacts_status_check
    check (status in ('pending', 'sent', 'bounced', 'unsubscribed', 'registered'))
);

create index if not exists outreach_contacts_city_idx
  on public.outreach_contacts (city);
create index if not exists outreach_contacts_status_idx
  on public.outreach_contacts (status);
create index if not exists outreach_contacts_campaign_idx
  on public.outreach_contacts (campaign_id);


alter table public.outreach_campaigns enable row level security;
alter table public.outreach_contacts  enable row level security;
