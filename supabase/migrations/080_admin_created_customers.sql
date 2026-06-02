alter table public.profiles
  add column if not exists is_admin_created boolean not null default false,
  add column if not exists created_by_admin_id uuid references auth.users(id);
