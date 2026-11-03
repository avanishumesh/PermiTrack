-- =============================================================================
-- PermiTrack 0006: private document storage
-- =============================================================================
-- Documents live in a PRIVATE bucket. The database never stores a public URL;
-- the server issues short-lived signed URLs after checking can_view_request().
--
-- Object layout (enforced again in public.api_register_document):
--   requests/{request_id}/{document_type_id}/v{version}/{safe_file_name}
--
-- Supabase storage policies are the second layer of defense: even if an object
-- path leaked, another user cannot read it through the storage API.
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'private-documents',
  'private-documents',
  false,
  10485760, -- 10 MB, matching the largest allowed required_document_types row
  array[
    'application/pdf',
    'image/png',
    'image/jpeg',
    'image/jpg',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Read: any user allowed to view the request.
drop policy if exists "documents_read_by_request_viewers" on storage.objects;
create policy "documents_read_by_request_viewers"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'private-documents'
    and split_part(name, '/', 1) = 'requests'
    and public.can_view_request(public.try_uuid(split_part(name, '/', 2)))
  );

-- Upload: the request creator / owner / editor while uploads are permitted.
drop policy if exists "documents_upload_by_owners" on storage.objects;
create policy "documents_upload_by_owners"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'private-documents'
    and split_part(name, '/', 1) = 'requests'
    and public.can_upload_documents(public.try_uuid(split_part(name, '/', 2)))
  );

-- Replace: overwriting an existing object is only possible for the same people.
drop policy if exists "documents_replace_by_owners" on storage.objects;
create policy "documents_replace_by_owners"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'private-documents'
    and split_part(name, '/', 1) = 'requests'
    and public.can_upload_documents(public.try_uuid(split_part(name, '/', 2)))
  )
  with check (
    bucket_id = 'private-documents'
    and split_part(name, '/', 1) = 'requests'
    and public.can_upload_documents(public.try_uuid(split_part(name, '/', 2)))
  );

-- Delete: administrators only. Normal replacements keep the old object so the
-- audit trail remains verifiable.
drop policy if exists "documents_delete_by_admins" on storage.objects;
create policy "documents_delete_by_admins"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'private-documents'
    and public.is_admin()
  );
