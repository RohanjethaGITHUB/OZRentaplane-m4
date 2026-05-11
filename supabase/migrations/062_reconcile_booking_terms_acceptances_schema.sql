-- FINAL LIVE RECONCILIATION: booking_terms_acceptances
-- Non-destructive: only adds missing columns/constraints/indexes/defaults.
-- No drops, no rewrites, no destructive DML.

-- ============================================================================
-- 1) PRE-CHECK COLUMNS
-- ============================================================================
select
  column_name,
  data_type,
  is_nullable,
  column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'booking_terms_acceptances'
order by ordinal_position;

-- ============================================================================
-- 2) PRE-CHECK CONSTRAINTS
-- ============================================================================
select
  conname,
  pg_get_constraintdef(c.oid) as definition
from pg_constraint c
join pg_class t on t.oid = c.conrelid
join pg_namespace n on n.oid = t.relnamespace
where n.nspname = 'public'
  and t.relname = 'booking_terms_acceptances'
order by conname;

-- ============================================================================
-- 3) SAFE SCHEMA RECONCILIATION
-- ============================================================================
create extension if not exists pgcrypto;

create table if not exists public.booking_terms_acceptances (
  id                  uuid primary key default gen_random_uuid(),
  booking_id          uuid references public.bookings(id) on delete cascade,
  checkout_request_id uuid references public.bookings(id) on delete cascade,
  user_id             uuid not null references auth.users(id) on delete cascade,
  terms_document_id   uuid not null,
  terms_version       text not null,
  terms_document_url  text,
  terms_content_hash  text,
  acceptance_text     text not null,
  accepted_ip         text,
  user_agent          text,
  accepted_at         timestamptz not null default now(),
  created_at          timestamptz not null default now()
);

alter table public.booking_terms_acceptances
  add column if not exists booking_id          uuid,
  add column if not exists checkout_request_id uuid,
  add column if not exists user_id             uuid,
  add column if not exists terms_document_id   uuid,
  add column if not exists terms_version       text,
  add column if not exists terms_document_url  text,
  add column if not exists terms_content_hash  text,
  add column if not exists acceptance_text     text,
  add column if not exists accepted_ip         text,
  add column if not exists user_agent          text,
  add column if not exists accepted_at         timestamptz,
  add column if not exists created_at          timestamptz;

-- defaults for timestamp columns if missing
alter table public.booking_terms_acceptances
  alter column accepted_at set default now(),
  alter column created_at  set default now();

-- checkout acceptance rows must support booking_id = null
alter table public.booking_terms_acceptances
  alter column booking_id drop not null;

-- add nullable FK for booking_id if missing
do $$
begin
  if not exists (
    select 1
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'booking_terms_acceptances'
      and c.conname = 'booking_terms_acceptances_booking_id_fkey'
  ) then
    alter table public.booking_terms_acceptances
      add constraint booking_terms_acceptances_booking_id_fkey
      foreign key (booking_id) references public.bookings(id) on delete cascade;
  end if;
end $$;

-- add nullable FK for checkout_request_id if missing
do $$
begin
  if not exists (
    select 1
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'booking_terms_acceptances'
      and c.conname = 'booking_terms_acceptances_checkout_request_id_fkey'
  ) then
    alter table public.booking_terms_acceptances
      add constraint booking_terms_acceptances_checkout_request_id_fkey
      foreign key (checkout_request_id) references public.bookings(id) on delete cascade;
  end if;
end $$;

-- add FK for user_id if missing
do $$
begin
  if not exists (
    select 1
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'booking_terms_acceptances'
      and c.conname = 'booking_terms_acceptances_user_id_fkey'
  ) then
    alter table public.booking_terms_acceptances
      add constraint booking_terms_acceptances_user_id_fkey
      foreign key (user_id) references auth.users(id) on delete cascade;
  end if;
end $$;

-- NOT NULL guards for required fields (only set when no null rows exist)
do $$
begin
  if not exists (select 1 from public.booking_terms_acceptances where user_id is null) then
    alter table public.booking_terms_acceptances alter column user_id set not null;
  end if;

  if not exists (select 1 from public.booking_terms_acceptances where terms_document_id is null) then
    alter table public.booking_terms_acceptances alter column terms_document_id set not null;
  end if;

  if not exists (select 1 from public.booking_terms_acceptances where terms_version is null) then
    alter table public.booking_terms_acceptances alter column terms_version set not null;
  end if;

  if not exists (select 1 from public.booking_terms_acceptances where acceptance_text is null) then
    alter table public.booking_terms_acceptances alter column acceptance_text set not null;
  end if;

  if not exists (select 1 from public.booking_terms_acceptances where accepted_at is null) then
    alter table public.booking_terms_acceptances alter column accepted_at set not null;
  end if;

  if not exists (select 1 from public.booking_terms_acceptances where created_at is null) then
    alter table public.booking_terms_acceptances alter column created_at set not null;
  end if;
end $$;

create index if not exists idx_booking_terms_acceptances_user_id
  on public.booking_terms_acceptances(user_id);

create index if not exists idx_booking_terms_acceptances_booking_id
  on public.booking_terms_acceptances(booking_id);

create index if not exists idx_booking_terms_acceptances_checkout_request_id
  on public.booking_terms_acceptances(checkout_request_id);

create index if not exists idx_booking_terms_acceptances_terms_document_id
  on public.booking_terms_acceptances(terms_document_id);

-- ============================================================================
-- 4) POSTGREST SCHEMA RELOAD
-- ============================================================================
notify pgrst, 'reload schema';

-- ============================================================================
-- 5) POST-CHECK REQUIRED SHAPE
-- ============================================================================
select
  column_name,
  data_type,
  is_nullable,
  column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'booking_terms_acceptances'
  and column_name in (
    'checkout_request_id',
    'terms_content_hash',
    'terms_document_id',
    'terms_version',
    'booking_id',
    'accepted_at'
  )
order by column_name;

-- explicit booking_id nullability check
select
  column_name,
  is_nullable as booking_id_is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'booking_terms_acceptances'
  and column_name = 'booking_id';
