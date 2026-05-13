-- Transactional email event log + dedupe guard

create table if not exists public.email_events (
  id uuid primary key default gen_random_uuid(),
  recipient_email text not null,
  event_type text not null,
  entity_type text not null,
  entity_id uuid null,
  entity_id_text text not null default '',
  resend_email_id text null,
  status text not null check (status in ('pending', 'sent', 'failed', 'skipped')),
  error_message text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.email_events
  add column if not exists entity_id_text text not null default '';

update public.email_events
set entity_id_text = coalesce(entity_id::text, concat(entity_type, ':none'))
where entity_id_text = '';

drop index if exists email_events_dedupe_idx;
create unique index if not exists email_events_dedupe_idx
  on public.email_events (event_type, entity_type, entity_id_text, recipient_email);

alter table public.email_events enable row level security;

drop policy if exists email_events_admin_select on public.email_events;
create policy email_events_admin_select
  on public.email_events
  for select
  to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));
