-- Backfill user_document_files for any user_documents rows that:
-- 1. Have a storage_path set (legacy single-file upload)
-- 2. Do not yet have any corresponding child rows in user_document_files

insert into user_document_files (document_id, file_name, storage_path, uploaded_at)
select
  d.id,
  coalesce(d.file_name, 'document'),
  d.storage_path,
  coalesce(d.uploaded_at, d.created_at, now())
from user_documents d
where
  d.storage_path is not null
  and d.storage_path <> ''
  and not exists (
    select 1
    from user_document_files f
    where f.document_id = d.id
  );
