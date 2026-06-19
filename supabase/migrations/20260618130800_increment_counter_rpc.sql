-- increment_counter RPC backing the analytics tracker
-- (src/app/api/analytics/track/route.ts). Called via the service-role key as
-- rpc('increment_counter', { dentist_id, field_name }) to bump one of the
-- denormalised per-dentist counters on public.dentists by 1.
--
-- Reconstructed from code usage (created out-of-band in Studio, no prior
-- migration). `create or replace` makes this a safe no-op rebuild against the
-- live DB while letting a fresh database stand the function up.
--
-- field_name is dynamic, so it is allow-listed against the exact set of
-- counter columns the route can send before being interpolated with %I — the
-- function refuses any other name rather than letting an arbitrary column be
-- written. Runs SECURITY DEFINER with a pinned search_path (writes already go
-- through the service-role key, but this keeps the function self-contained).

create or replace function public.increment_counter(dentist_id uuid, field_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if field_name not in ('profile_views', 'whatsapp_clicks', 'call_clicks', 'booking_clicks') then
    raise exception 'increment_counter: disallowed field_name %', field_name;
  end if;

  execute format(
    'update public.dentists set %I = coalesce(%I, 0) + 1 where id = $1',
    field_name, field_name
  ) using dentist_id;
end;
$$;
