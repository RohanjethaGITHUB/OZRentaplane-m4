-- Allow authenticated customers to read their own terms acceptance rows.
-- This is additive only: it preserves the existing insert policy and simply
-- closes the read gap for customer-facing documents/progress screens.

alter table public.booking_terms_acceptances enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'booking_terms_acceptances'
      and policyname = 'Customers can view their own terms acceptances'
  ) then
    create policy "Customers can view their own terms acceptances"
      on public.booking_terms_acceptances
      for select
      to authenticated
      using (user_id = auth.uid());
  end if;
end
$$;

notify pgrst, 'reload schema';
