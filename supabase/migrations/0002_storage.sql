-- Private "documents" bucket, 10 MB per file, PDF only (server-enforced on upload)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documents', 'documents', false, 10485760, array['application/pdf'])
on conflict (id) do nothing;

-- Path convention: users/{userId}/documents/{documentId}.pdf
-- (storage.foldername(name))[1] = 'users', [2] = {userId}

create policy documents_bucket_select_own_folder
on storage.objects for select to authenticated
using (
  bucket_id = 'documents'
  and (storage.foldername(name))[1] = 'users'
  and (storage.foldername(name))[2] = (select auth.uid()::text)
);

create policy documents_bucket_insert_own_folder
on storage.objects for insert to authenticated
with check (
  bucket_id = 'documents'
  and (storage.foldername(name))[1] = 'users'
  and (storage.foldername(name))[2] = (select auth.uid()::text)
);

create policy documents_bucket_delete_own_folder
on storage.objects for delete to authenticated
using (
  bucket_id = 'documents'
  and (storage.foldername(name))[1] = 'users'
  and (storage.foldername(name))[2] = (select auth.uid()::text)
);
