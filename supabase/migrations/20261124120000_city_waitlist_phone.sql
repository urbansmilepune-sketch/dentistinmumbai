-- Opening city sites (24 Nov 2026) ask patients for a WhatsApp number and
-- their area instead of an email. Email becomes optional; one row per
-- phone per city, like the existing (email, city_slug) rule.
alter table public.city_waitlist alter column email drop not null;
alter table public.city_waitlist add column if not exists phone text;
alter table public.city_waitlist add column if not exists area text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'city_waitlist_phone_city_unique') then
    alter table public.city_waitlist
      add constraint city_waitlist_phone_city_unique unique (phone, city_slug);
  end if;
end $$;

alter table public.city_waitlist
  drop constraint if exists city_waitlist_contact_present;
alter table public.city_waitlist
  add constraint city_waitlist_contact_present check (email is not null or phone is not null);
