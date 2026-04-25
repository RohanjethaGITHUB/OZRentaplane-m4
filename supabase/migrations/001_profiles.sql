-- ============================================================
-- Run this in the Supabase dashboard → SQL Editor
-- ============================================================


-- ── 1. Profiles table ────────────────────────────────────────

create table public.profiles (
  id                  uuid        primary key references auth.users(id) on delete cascade,
  full_name           text,
  role                text        not null default 'customer',
  verification_status text        not null default 'not_started',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint profiles_role_check
    check (role in ('customer', 'admin')),

  constraint profiles_verification_status_check
    check (verification_status in (
      'not_started',
      'pending_review',
      'verified',
      'rejected'
    ))
);


-- ── 2. Keep updated_at current ───────────────────────────────

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_profiles_updated_at
  before update on public.profiles
  for each row
  execute function public.set_updated_at();


-- ── 3. Row Level Security ────────────────────────────────────

alter table public.profiles enable row level security;

-- Security-definer helper: reads the caller's current role,
-- bypassing RLS so the with-check clause below can compare
-- the incoming role value against the stored one.
create or replace function public.get_own_role()
returns text
language sql
security definer
stable
set search_path = ''
as $$
  select role from public.profiles where id = auth.uid()
$$;

-- Users can read their own profile row
create policy "Users can view own profile"
  on public.profiles
  for select
  to authenticated
  using (auth.uid() = id);

-- Users can update their own profile but cannot change their role.
-- The with-check compares the NEW role value against the stored one
-- returned by get_own_role() (which sees pre-update data).
create policy "Users can update own profile"
  on public.profiles
  for update
  to authenticated
  using (auth.uid() = id)
  with check (
    auth.uid() = id
    and role = public.get_own_role()
  );


-- ── 4. Auto-create profile on signup ─────────────────────────

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, role, verification_status)
  values (
    new.id,
    new.raw_user_meta_data ->> 'full_name',
    'customer',
    'not_started'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();
