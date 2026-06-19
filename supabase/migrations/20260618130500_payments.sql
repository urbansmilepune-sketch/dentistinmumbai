-- Razorpay subscription payments. Reconstructed from code usage (created
-- out-of-band in Studio, no prior create-table migration). Rows are written
-- ONLY by the service-role /api/payments/verify route after HMAC verification.
--
-- The unique constraint on razorpay_payment_id is load-bearing: it's what
-- blocks replay attacks — a second verify call with the same payment id hits a
-- 23505 and the route returns 409 without re-extending the dentist's tier.
-- amount_paise stores the amount in paise (integer) to avoid float rounding.

create table if not exists public.payments (
  id                  uuid primary key default gen_random_uuid(),
  razorpay_payment_id text not null unique,
  razorpay_order_id   text not null,
  dentist_id          uuid not null references public.dentists(id) on delete cascade,
  amount_paise        integer not null,
  plan                text not null,
  created_at          timestamptz not null default now()
);

create index if not exists payments_dentist_created_idx
  on public.payments (dentist_id, created_at desc);

-- Writes go through the service-role key (bypasses RLS), so there is no insert
-- policy. Dentists may read their own payment history.
alter table public.payments enable row level security;

drop policy if exists "Dentists read their own payments" on public.payments;
create policy "Dentists read their own payments"
  on public.payments
  for select
  using (
    dentist_id in (select id from public.dentists where email = auth.jwt() ->> 'email')
  );
