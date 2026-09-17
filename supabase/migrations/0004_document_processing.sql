-- "Meine Schule": persisted document processing lifecycle.
--
-- Processing runs in the browser right after upload (extraction + OCR
-- via the existing inspection pipeline). The persisted status survives
-- reloads, navigation and tab switches, and only 'completed' documents
-- can be opened. Content and the 'completed' status are written in one
-- UPDATE, so a document is never openable without its extraction data.
--
--   'pending'    right after upload, before processing started
--   'processing' extraction/OCR is running
--   'completed'  content is persisted, the document can be opened
--   'failed'     the pipeline errored; the UI offers a retry
--
-- Pre-existing documents become 'completed': they keep working exactly
-- as before (the viewer's inspect-on-open fallback fills their content
-- on first open). Owner updates are already covered by
-- documents_update_own, and documents_check_immutable does not list
-- this column.
alter table public.documents
  add column if not exists processing_status text not null default 'pending'
  check (processing_status in ('pending', 'processing', 'completed', 'failed'));

update public.documents set processing_status = 'completed';
