-- Adds mandatory-field columns required by the prescription PDF and the
-- invoice PDF. Both PDFs now read these directly from the dentists /
-- invoices rows; the prescription PDF needs `degree` so it can render
-- "Dr. X, BDS, MDS" under the header, and the invoice PDF needs
-- payment_method + gst_amount so PAID/PENDING invoices can show the
-- mode of payment and an 18% GST line item.
--
-- All three columns are nullable so historical rows continue to work —
-- the PDF generators check for empty values and skip those rows.

alter table public.dentists
  add column if not exists degree text;

alter table public.invoices
  add column if not exists payment_method text,
  add column if not exists gst_amount numeric default 0;
