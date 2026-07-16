-- 1. Widen the profiles.role CHECK
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check CHECK (role in ('customer', 'admin', 'instructor'));

-- 2. Create table public.user_roles
CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('customer', 'admin', 'instructor')),
  granted_by uuid references auth.users(id),
  granted_at timestamptz not null default now(),
  constraint user_roles_user_role_key unique (user_id, role)
);

CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON public.user_roles(user_id);

-- 3. Backfill
INSERT INTO public.user_roles (user_id, role, granted_by, granted_at)
SELECT id, role, NULL, now() FROM public.profiles
ON CONFLICT (user_id, role) DO NOTHING;

-- 4. RLS
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own roles"
  ON public.user_roles FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all roles"
  ON public.user_roles FOR SELECT TO authenticated
  USING (public.get_own_role() = 'admin');

CREATE POLICY "Admins can insert roles"
  ON public.user_roles FOR INSERT TO authenticated
  WITH CHECK (public.get_own_role() = 'admin');

CREATE POLICY "Admins can update roles"
  ON public.user_roles FOR UPDATE TO authenticated
  USING (public.get_own_role() = 'admin');

CREATE POLICY "Admins can delete roles"
  ON public.user_roles FOR DELETE TO authenticated
  USING (public.get_own_role() = 'admin');

-- 5. public.has_role function
CREATE OR REPLACE FUNCTION public.has_role(check_user_id uuid, check_role text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.user_roles
    WHERE user_id = check_user_id AND role = check_role
  );
$$;

REVOKE ALL ON FUNCTION public.has_role(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, text) TO authenticated;
