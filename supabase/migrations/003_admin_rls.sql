-- ============================================================
-- Add Admin RLS Policies
-- ============================================================

-- ── Profiles ────────────────────────────────────────────────

-- Allow admins to read all profiles
create policy "Admins can select all profiles"
  on public.profiles
  for select
  to authenticated
  using (public.get_own_role() = 'admin');

-- Allow admins to update any profile (e.g. verification_status)
create policy "Admins can update all profiles"
  on public.profiles
  for update
  to authenticated
  using (public.get_own_role() = 'admin');


-- ── User Documents ──────────────────────────────────────────

-- Allow admins to read all user documents
create policy "Admins can select all user documents"
  on public.user_documents
  for select
  to authenticated
  using (public.get_own_role() = 'admin');

-- Allow admins to update any user document (e.g. status, review_notes)
create policy "Admins can update all user documents"
  on public.user_documents
  for update
  to authenticated
  using (public.get_own_role() = 'admin');
