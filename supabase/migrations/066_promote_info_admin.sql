BEGIN;

-- Promote the existing Auth user for info@ozrentaplane.com to admin.
-- Safe/idempotent behavior:
--   - Does nothing if no auth.users row exists yet.
--   - Updates existing profile role to 'admin' when present.
--   - Inserts a minimal profile row only if the profile is missing for an existing Auth user.
DO $$
DECLARE
  v_target_email CONSTANT text := 'info@ozrentaplane.com';
  v_user_id uuid;
  v_user_email text;
BEGIN
  SELECT u.id, u.email
    INTO v_user_id, v_user_email
  FROM auth.users u
  WHERE lower(u.email) = lower(v_target_email)
  ORDER BY u.created_at ASC
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE NOTICE 'No auth.users row exists for %, skipping admin promotion.', v_target_email;
    RETURN;
  END IF;

  INSERT INTO public.profiles (
    id,
    email,
    role,
    verification_status,
    pilot_clearance_status,
    account_status,
    created_at,
    updated_at
  )
  VALUES (
    v_user_id,
    v_user_email,
    'admin',
    'not_started',
    'checkout_required',
    'active',
    now(),
    now()
  )
  ON CONFLICT (id) DO UPDATE
    SET role = 'admin',
        email = COALESCE(public.profiles.email, EXCLUDED.email),
        updated_at = now();

  RAISE NOTICE 'Promoted % (user_id=%) to admin.', v_user_email, v_user_id;
END $$;

COMMIT;
