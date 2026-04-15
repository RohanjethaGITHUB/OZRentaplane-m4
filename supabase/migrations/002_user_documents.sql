-- ============================================================
-- 1. Create User Documents Table
-- ============================================================
create table public.user_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  document_type text not null,
  file_name text not null,
  storage_path text not null,
  status text not null default 'uploaded',
  review_notes text,
  uploaded_at timestamptz not null default now(),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint document_type_check
    check (document_type in ('pilot_licence', 'medical_certificate', 'photo_id')),

  constraint status_check
    check (status in ('uploaded', 'approved', 'rejected')),
    
  constraint user_documents_unique_type 
    unique(user_id, document_type)
);

create index idx_user_documents_user_id on public.user_documents(user_id);

-- Note: public.set_updated_at() was created in 001_profiles.sql
create trigger set_user_documents_updated_at
  before update on public.user_documents
  for each row
  execute function public.set_updated_at();

-- RLS
alter table public.user_documents enable row level security;

create policy "Users can select own documents"
  on public.user_documents for select to authenticated using (auth.uid() = user_id);

create policy "Users can insert own documents"
  on public.user_documents for insert to authenticated with check (auth.uid() = user_id);

create policy "Users can update own documents"
  on public.user_documents for update to authenticated 
  using (auth.uid() = user_id) with check (auth.uid() = user_id);


-- ============================================================
-- 2. Create Storage Bucket securely
-- ============================================================
insert into storage.buckets (id, name, public) 
values ('verification_documents', 'verification_documents', false)
on conflict do nothing;

-- Ensure bucket RLS is active
update storage.buckets set public = false where id = 'verification_documents';

create policy "Users can upload their own verification documents"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'verification_documents' and 
  (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Users can update their own verification documents"
on storage.objects for update to authenticated
using (
  bucket_id = 'verification_documents' and 
  (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Users can read their own verification documents"
on storage.objects for select to authenticated
using (
  bucket_id = 'verification_documents' and 
  (storage.foldername(name))[1] = auth.uid()::text
);
