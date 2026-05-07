BEGIN;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS first_name text,
  ADD COLUMN IF NOT EXISTS last_name text,
  ADD COLUMN IF NOT EXISTS phone_country_code text DEFAULT '+61',
  ADD COLUMN IF NOT EXISTS phone_number text;

UPDATE public.profiles
SET
  first_name = CASE
    WHEN NULLIF(TRIM(full_name), '') IS NULL THEN NULL
    WHEN strpos(TRIM(full_name), ' ') > 0 THEN split_part(TRIM(full_name), ' ', 1)
    ELSE TRIM(full_name)
  END,
  last_name = CASE
    WHEN NULLIF(TRIM(full_name), '') IS NULL THEN NULL
    WHEN strpos(TRIM(full_name), ' ') > 0 THEN NULLIF(TRIM(substring(TRIM(full_name) FROM length(split_part(TRIM(full_name), ' ', 1)) + 1)), '')
    ELSE NULL
  END
WHERE NULLIF(TRIM(first_name), '') IS NULL
  AND NULLIF(TRIM(full_name), '') IS NOT NULL;

UPDATE public.profiles
SET first_name = NULL
WHERE NULLIF(TRIM(first_name), '') IS NULL;

UPDATE public.profiles
SET phone_country_code = '+61'
WHERE phone_country_code IS NULL OR NULLIF(TRIM(phone_country_code), '') IS NULL;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_first_name text;
  v_last_name text;
  v_full_name text;
  v_phone_country_code text;
  v_phone_number text;
BEGIN
  v_first_name := NULLIF(TRIM(NEW.raw_user_meta_data ->> 'first_name'), '');
  v_last_name := NULLIF(TRIM(NEW.raw_user_meta_data ->> 'last_name'), '');

  IF v_first_name IS NOT NULL AND v_last_name IS NOT NULL THEN
    v_full_name := NULLIF(TRIM(concat_ws(' ', v_first_name, v_last_name)), '');
  ELSE
    v_full_name := COALESCE(
      NULLIF(TRIM(NEW.raw_user_meta_data ->> 'full_name'), ''),
      NULLIF(TRIM(NEW.raw_user_meta_data ->> 'name'), ''),
      NULLIF(TRIM(concat_ws(' ', v_first_name, v_last_name)), '')
    );
  END IF;

  IF v_full_name IS NOT NULL AND (v_first_name IS NULL OR v_last_name IS NULL) THEN
    IF strpos(v_full_name, ' ') > 0 THEN
      IF v_first_name IS NULL THEN
        v_first_name := split_part(v_full_name, ' ', 1);
      END IF;
      IF v_last_name IS NULL THEN
        v_last_name := NULLIF(TRIM(substring(v_full_name FROM length(split_part(v_full_name, ' ', 1)) + 1)), '');
      END IF;
    ELSE
      IF v_first_name IS NULL THEN
        v_first_name := v_full_name;
      END IF;
      IF v_last_name IS NULL THEN
        v_last_name := NULL;
      END IF;
    END IF;
  END IF;

  v_phone_country_code := COALESCE(NULLIF(TRIM(NEW.raw_user_meta_data ->> 'phone_country_code'), ''), '+61');
  v_phone_number := NULLIF(TRIM(NEW.raw_user_meta_data ->> 'phone_number'), '');

  INSERT INTO public.profiles (
    id,
    full_name,
    first_name,
    last_name,
    phone_country_code,
    phone_number,
    email,
    role,
    verification_status,
    pilot_clearance_status,
    account_status
  )
  VALUES (
    NEW.id,
    v_full_name,
    v_first_name,
    v_last_name,
    v_phone_country_code,
    v_phone_number,
    NEW.email,
    'customer',
    'not_started',
    'checkout_required',
    'active'
  )
  ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email;

  RETURN NEW;
END;
$$;

NOTIFY pgrst, 'reload schema';

COMMIT;
