-- ============================================================
-- 011_oauth_profile_name.sql
-- Update the handle_new_user trigger to pick up the user's
-- display name from any OAuth provider.  Google, Apple, and
-- Facebook may place the name in 'name' rather than 'full_name'.
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, role, verification_status)
  VALUES (
    new.id,
    COALESCE(
      NULLIF(TRIM(new.raw_user_meta_data ->> 'full_name'), ''),
      NULLIF(TRIM(new.raw_user_meta_data ->> 'name'), '')
    ),
    'customer',
    'not_started'
  );
  RETURN new;
END;
$$;

-- The trigger itself (on_auth_user_created) already exists from 001_profiles.sql
-- and does not need to be recreated — CREATE OR REPLACE on the function is sufficient.
