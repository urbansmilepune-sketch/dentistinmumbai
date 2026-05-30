-- DentistIn ↔ DentalSamaan integration columns.
--
-- inventory_reorders and dentists both pre-date this repo's migration history
-- (the base tables were created directly in Supabase), so we extend them with
-- additive, idempotent ALTERs rather than a CREATE.
--
--   inventory_reorders.ds_order_number — DentalSamaan order number, stamped by
--       the inbound webhook (src/app/api/webhooks/dentalsamaan) once an order
--       is confirmed. Null until then (the order is created on DentalSamaan
--       at checkout, after we mint the SSO token).
--   inventory_reorders.ds_product_slug — slugified item name we sent over as
--       the cart product slug; the webhook matches on (dentist_id, this) to
--       correlate an order back to the originating reorder row.
--   dentists.gstin — the clinic's GSTIN, passed through to DentalSamaan for
--       B2B invoicing. Nullable; historical rows simply don't have one.

alter table public.inventory_reorders
  add column if not exists ds_order_number text,
  add column if not exists ds_product_slug text;

alter table public.dentists
  add column if not exists gstin text;

-- Webhook correlation lookups: by order number (delivered/cancelled) and by
-- (dentist_id, slug) for the initial confirmed match.
create index if not exists inventory_reorders_ds_order_number_idx
  on public.inventory_reorders (ds_order_number);

create index if not exists inventory_reorders_ds_slug_idx
  on public.inventory_reorders (dentist_id, ds_product_slug);
