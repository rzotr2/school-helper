-- "Meine Schule": persisted semantic document understanding.
--
-- First AI semantic layer: stores lightweight, structured metadata
-- (title, documentType, subject, summary, keyTopics, analyzedAt)
-- generated from persisted deterministic DocumentContent.
--
-- Column is nullable JSONB:
-- - strictly optional: existing and newly uploaded documents remain valid without it
-- - independent from processing_status (which tracks PDF extraction / OCR)
-- - updated by the document owner through existing documents_update_own RLS policy
--
alter table public.documents
  add column if not exists understanding jsonb null;
