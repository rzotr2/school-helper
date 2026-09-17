-- "Meine Schule": persisted per-page extraction data for documents.
-- The original PDF in Storage remains the visual source of truth; this
-- column only holds the dual text representations (nativeText + ocrText)
-- plus processing metadata, so reopening a document does not re-extract
-- or re-OCR pages that were already processed.
--
-- Shape (application-owned JSON):
--   { "pages": [ { "pageNumber": 1, "nativeText": "...", "quality": {...},
--                  "ocrText": "...", "ocrStatus": "not-generated"|"completed"|"failed" } ] }
--
-- NULL = no persisted content yet: pre-existing and freshly uploaded
-- documents keep working unchanged, and existing rows are preserved.
-- Owner updates are already covered by documents_update_own (it checks
-- owner_id and topic ownership, neither of which a content update changes),
-- and documents_check_immutable does not list this column.
alter table public.documents
  add column if not exists content jsonb;
