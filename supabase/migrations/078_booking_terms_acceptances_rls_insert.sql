-- Allow authenticated customers to insert their own terms acceptance rows directly.
-- This is the clean alternative to routing inserts through SECURITY DEFINER functions
-- or admin clients. The check ensures user_id always matches the authenticated caller.
--
-- NOTE: The current server action (acceptCurrentBookingTermsFromReadiness) uses the
-- admin client as a working fix for the missing policy. Applying this migration allows
-- that action to switch back to the user client if preferred.

create policy "Customers can insert their own terms acceptances"
  on public.booking_terms_acceptances
  for insert
  to authenticated
  with check (user_id = auth.uid());

notify pgrst, 'reload schema';
