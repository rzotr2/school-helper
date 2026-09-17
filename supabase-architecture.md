# Supabase Architecture

Single backend platform: Supabase. This file documents the data model, the RLS
security model, Storage conventions and the auth flow. The SQL migrations in
`supabase/migrations/` are the executable source of truth; this document is the
human-readable summary.

## Database schema (`0001_init.sql`)

All tables are in `public`, UUID primary keys (generated client-side via
`crypto.randomUUID()`), timestamps set by the database (`created_at`/`updated_at`
defaults and a `set_updated_at` trigger).

| Table | Columns | Constraints |
|---|---|---|
| `profiles` | `id` → auth.users, timestamps | — |
| `subjects` | `id`, `owner_id` → auth.users, `name`, `position`, timestamps | `name` 1–100 chars |
| `topics` | `id`, `owner_id`, `subject_id` → subjects, `name`, `position`, timestamps | `name` 1–100 chars |
| `documents` | `id`, `owner_id`, `topic_id` → topics, `original_name`, `storage_path`, `mime_type`, `size`, `content`, `processing_status`, timestamps | `original_name` 1–255; `storage_path` 1–500; `mime_type = 'application/pdf'`; `size > 0` |

`content` is a nullable `jsonb` column added by `0003_document_content.sql`:
application-owned per-page extraction data (shape: `{ "pages": [ { "pageNumber",
"nativeText", "quality", "ocrText", "ocrStatus" } ] }`), persisted so reopening a
document reuses already extracted/OCR'd pages instead of re-processing them.
`NULL` = not inspected yet. The original PDF in Storage remains the visual source
of truth; no rendered images or PDF bytes are stored in the database.

`processing_status` is a `text` column added by `0004_document_processing.sql`
(`pending` | `processing` | `completed` | `failed`, NOT NULL, default `pending`;
pre-existing rows migrated to `completed`). Only `completed` documents can be
opened; content and the `completed` status are written in one UPDATE, so a
document is never openable without its extraction data. Processing runs in the
browser; the persisted status is what survives reloads.

All foreign keys cascade on delete: auth.users → profiles/subjects/topics/documents
(by `owner_id`), subjects → topics, topics → documents.

Indexes: `subjects(owner_id, position)`, `topics(owner_id, subject_id, position)`,
`documents(owner_id)`, `documents(owner_id, topic_id)`.

## RLS policy matrix

RLS enabled on all four tables. No `anon` policies or grants — deny-by-default.
Grants go to `authenticated` only (profiles: select/insert/update — no delete).

| Table | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `profiles` | `id = auth.uid()` | `id = auth.uid()` | `id = auth.uid()` | `id = auth.uid()` (no grant) |
| `subjects` | `owner_id = auth.uid()` | owner + own profile exists | owner | owner |
| `topics` | `owner_id = auth.uid()` | owner + subject owned by user | owner | owner |
| `documents` | `owner_id = auth.uid()` | owner + topic owned by user | owner + (new) topic owned by user | owner |

Immutability BEFORE UPDATE triggers (second layer behind RLS):

- `documents`: `owner_id`, `storage_path`, `mime_type`, `size`, `created_at` (topic is movable)
- `topics`: `owner_id`, `subject_id`, `created_at`
- `subjects`: `owner_id`, `created_at`

## Storage (`0002_storage.sql`)

- Bucket `documents`: private (`public = false`), `file_size_limit = 10485760`
  (10 MB), `allowed_mime_types = ['application/pdf']`.
- Path convention: `users/{userId}/documents/{documentId}.pdf`.
- `storage.objects` policies for `authenticated`: select/insert/delete only when
  `bucket_id = 'documents'` and the first two path segments are
  `('users', auth.uid()::text)`. **No UPDATE policy on purpose** — uploads use
  `upsert: false`, and object paths never change.
- Downloads: `createSignedUrl(path, 3600)` (one hour). The app never calls
  `getPublicUrl`; the bucket stays private.

## Auth flow

- Supabase Auth with Google OAuth only (`signInWithOAuth`, full-page redirect —
  no popup).
- `AuthContext` restores the session via `getSession()` + `onAuthStateChange`.
- Client singleton: `src/infrastructure/supabase/client.ts`, configured by
  `VITE_SUPABASE_URL` + `VITE_SUPABASE_PUBLISHABLE_KEY` (anon key — safe for the
  frontend). The service-role key must never appear in frontend configuration.

## Environment

| Variable | Where | Notes |
|---|---|---|
| `VITE_SUPABASE_URL` | `.env` | bare project URL, not the REST endpoint |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | `.env` | anon key |

## Test matrix

| Suite | Location | What it covers | Infrastructure |
|---|---|---|---|
| Unit tests | `src/application/use-cases/documents.test.ts` | `normalizeDocumentName` | none |
| Unit tests | `src/application/use-cases/documentContent.test.ts` | persisted content parse/map/merge (pure functions) | none |
| Unit tests | `src/application/use-cases/documentProcessing.test.ts` | processing lifecycle orchestration (mocked client + pipeline) | none |

Security note: the SQL policy matrix above has been statically audited, and the
anonymous deny-by-default behavior was runtime-verified against the hosted project.
Automated authenticated two-user runtime security testing is intentionally deferred.
