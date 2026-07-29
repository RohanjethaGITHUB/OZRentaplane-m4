-- Durable transactional email outbox for Batch 6.
-- Service-side code enqueues and processes jobs; browser clients receive no table access.

create table if not exists public.email_outbox (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  recipient_email text not null,
  payload jsonb not null,
  idempotency_key text not null unique,
  status text not null default 'pending' check (status in ('pending', 'processing', 'sent', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 5 check (max_attempts > 0),
  available_at timestamptz not null default now(),
  locked_at timestamptz null,
  locked_by text null,
  last_error text null,
  provider_message_id text null,
  created_at timestamptz not null default now(),
  sent_at timestamptz null,
  updated_at timestamptz not null default now()
);

create index if not exists email_outbox_pending_idx
  on public.email_outbox (available_at, created_at)
  where status in ('pending', 'failed');

create index if not exists email_outbox_processing_stale_idx
  on public.email_outbox (locked_at)
  where status = 'processing';

alter table public.email_outbox enable row level security;

-- No SELECT/INSERT/UPDATE/DELETE policies are created for authenticated users.
-- This prevents customers and admins from reading queued email payloads, enqueueing
-- arbitrary recipients, changing status, or forcing retries. The service role bypasses
-- RLS for trusted server actions and the protected processor route.

create or replace function public.touch_email_outbox_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists touch_email_outbox_updated_at on public.email_outbox;
create trigger touch_email_outbox_updated_at
before update on public.email_outbox
for each row
execute function public.touch_email_outbox_updated_at();

create or replace function public.claim_email_outbox_jobs(
  p_limit integer default 10,
  p_worker_id text default null,
  p_stale_after interval default interval '10 minutes'
)
returns setof public.email_outbox
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.email_outbox
  set
    status = case
      when attempts >= max_attempts then 'failed'
      else 'pending'
    end,
    locked_at = null,
    locked_by = null,
    available_at = case
      when attempts >= max_attempts then available_at
      else now()
    end,
    last_error = case
      when attempts >= max_attempts then coalesce(last_error, 'STALE_PROCESSING_LOCK_MAX_ATTEMPTS')
      else last_error
    end
  where status = 'processing'
    and locked_at < now() - p_stale_after;

  return query
  with candidates as (
    select id
    from public.email_outbox
    where status in ('pending', 'failed')
      and attempts < max_attempts
      and available_at <= now()
    order by available_at asc, created_at asc
    limit greatest(least(p_limit, 50), 1)
    for update skip locked
  )
  update public.email_outbox e
  set
    status = 'processing',
    attempts = e.attempts + 1,
    locked_at = now(),
    locked_by = coalesce(nullif(p_worker_id, ''), 'email-outbox-worker'),
    last_error = null
  from candidates
  where e.id = candidates.id
  returning e.*;
end;
$$;

revoke all on function public.claim_email_outbox_jobs(integer, text, interval) from public;
grant execute on function public.claim_email_outbox_jobs(integer, text, interval) to service_role;
