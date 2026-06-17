-- Create child table for per-file storage within a document submission
create table user_document_files (
  id            uuid primary key default gen_random_uuid(),
  document_id   uuid not null references user_documents(id) on delete cascade,
  file_name     text not null,
  storage_path  text not null,
  uploaded_at   timestamptz not null default now()
);

-- Enable RLS
alter table user_document_files enable row level security;

-- Customers can read files belonging to their own documents
create policy "customer_read_own_files"
on user_document_files for select
using (
  exists (
    select 1 from user_documents d
    where d.id = user_document_files.document_id
    and d.user_id = auth.uid()
  )
);

-- Customers can insert files for their own documents
create policy "customer_insert_own_files"
on user_document_files for insert
with check (
  exists (
    select 1 from user_documents d
    where d.id = user_document_files.document_id
    and d.user_id = auth.uid()
  )
);

-- Customers can delete their own files (for Replace flow)
create policy "customer_delete_own_files"
on user_document_files for delete
using (
  exists (
    select 1 from user_documents d
    where d.id = user_document_files.document_id
    and d.user_id = auth.uid()
  )
);

-- Admins can read all files
create policy "admin_read_all_files"
on user_document_files for select
using (
  exists (
    select 1 from profiles
    where profiles.id = auth.uid()
    and profiles.role = 'admin'
  )
);

-- Admins can delete files (needed for admin-side document management)
create policy "admin_delete_all_files"
on user_document_files for delete
using (
  exists (
    select 1 from profiles
    where profiles.id = auth.uid()
    and profiles.role = 'admin'
  )
);

-- Make file_name and storage_path on user_documents nullable
-- (retained for safety during transition, will be dropped once confirmed clean)
alter table user_documents
  alter column file_name    drop not null,
  alter column storage_path drop not null;
