-- Track where terms acceptance happened (checkout flow vs booking readiness gate).
alter table public.booking_terms_acceptances
  add column if not exists acceptance_context text;

create index if not exists idx_booking_terms_acceptances_context
  on public.booking_terms_acceptances(acceptance_context);
