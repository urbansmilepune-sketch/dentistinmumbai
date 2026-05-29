-- Per-dentist "Why Choose Me" bullet list. Surfaces on the public profile
-- between About and Treatments when the dentist has filled in at least one
-- point. Stored as a text[] (capped to 5 in the dashboard UI) so the public
-- page can render each entry as a separate bullet without splitting on a
-- delimiter character that a dentist might legitimately type.
alter table public.dentists
  add column if not exists why_choose_us text[] default '{}';
