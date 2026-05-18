# Admin User Setup (`info@ozrentaplane.com`)

## Existing project pattern
- Admin access is determined by `public.profiles.role = 'admin'`.
- `/admin` is server-guarded in `app/admin/layout.tsx` by loading the logged-in user's `profiles.role` and redirecting non-admin users to `/dashboard`.
- RLS admin checks also use role from `public.profiles` (for example via `public.get_own_role() = 'admin'`).

## Migration added
- Migration: `supabase/migrations/066_promote_info_admin.sql`
- Behavior:
  - Looks up Auth user by email `info@ozrentaplane.com` in `auth.users`.
  - If user exists: promotes/upserts profile to `role = 'admin'` (no duplicate profile creation).
  - If user does not exist: does nothing except a SQL `NOTICE`.

## Important security notes
- No password is hardcoded in this repository.
- No `service_role` key is exposed to the browser for this setup.
- Auth user creation should be done in Supabase Dashboard (or trusted server context only).

## If Auth user does not exist yet (Dashboard steps)
1. Open Supabase Dashboard for this project.
2. Go to `Authentication` > `Users`.
3. Click `Add user`.
4. Enter email: `info@ozrentaplane.com`.
5. Set a temporary password (do not commit/store it in code).
6. Create user.
7. Run migrations so `066_promote_info_admin.sql` promotes that user to admin.

## Password set/reset options
- Option A: Create with a temporary password in `Authentication > Users`, then share securely and rotate/reset after first login.
- Option B: Use Supabase password reset flow so final password is chosen securely by the user.

## Verification checklist
1. Login as `info@ozrentaplane.com` and navigate to `/admin` (should be allowed).
2. Login as a normal customer account and navigate to `/admin` (should redirect to `/dashboard`).
3. In SQL editor, optional checks:

```sql
-- Confirm promoted admin profile
select id, email, role
from public.profiles
where lower(email) = lower('info@ozrentaplane.com');

-- Optional: confirm matching auth user exists
select id, email, created_at
from auth.users
where lower(email) = lower('info@ozrentaplane.com');
```
