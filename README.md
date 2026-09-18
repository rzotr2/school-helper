# Materia

A personal digital school workspace for Berufsschule students. Organize school materials in one place — the UI is German.

## Product

A student has **Subjects** (`Fächer`). Each subject has **Topics** (`Themen`). Each topic contains **Documents**, currently PDF files.

```
Subject
└── Topic
    └── Document (PDF)
```

Current features:

- Google Sign-In, protected routes
- Subject & Topic CRUD with cascade deletion
- PDF upload with progress, 10 MB limit
- Global library („Alle Dateien") with subject/topic filters and filename search
- Document management: open, rename, move between topics, delete

Document intelligence (classification, summaries, search, learning assistance) is a **future** direction, not implemented.

## Stack

- React 19, TypeScript, Vite 6
- Tailwind CSS 4, lucide-react
- React Router 7
- Supabase: Auth (Google only), PostgreSQL with RLS, Storage (private bucket, signed URLs)
- Vitest for unit tests; ESLint; package manager: **npm** (`package-lock.json` is canonical)

## Architecture

```
UI (src/ui)
↓
Application / Use Cases (src/application/use-cases)
↓
Infrastructure (src/infrastructure: supabase client, auth)
↓
Supabase (Auth, PostgreSQL, Storage)
```

UI calls use cases; business logic lives in `src/application/use-cases`, never in UI components.
See `supabase-architecture.md` for the database schema, RLS policy matrix and Storage conventions.

## Data model

| Table | Key fields |
|---|---|
| `profiles` | `id` (→ auth.users), `created_at`, `updated_at` |
| `subjects` | `id`, `owner_id`, `name`, `position`, timestamps |
| `topics` | `id`, `owner_id`, `subject_id`, `name`, `position`, timestamps |
| `documents` | `id`, `owner_id`, `topic_id`, `original_name`, `storage_path`, `mime_type`, `size`, `content`, `processing_status`, timestamps |

Storage path: `users/{userId}/documents/{documentId}.pdf` — it stays fixed when a document is renamed or moved.

## Local development

```bash
npm install
cp .env.example .env   # fill in VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY
npm run dev            # http://localhost:3000
```

Supabase configuration lives in the project dashboard, not in the repo. Database schema and
security policies are the SQL migrations in `supabase/migrations/`.

### Commands

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server on port 3000 |
| `npm run build` | Production build |
| `npm run lint` | `tsc --noEmit` + ESLint |
| `npm test` | Vitest unit tests (no external services required) |
| `npm run clean` | Remove `dist/` |

## Security model

Defense in depth, all data private:

1. **Application layer** — every use case verifies ownership (`owner_id`) before reads/writes.
2. **PostgreSQL RLS** (`supabase/migrations/0001_init.sql`) — deny-by-default; users can only
   access their own rows; cross-table ownership checks on insert/update; immutability triggers
   protect `owner_id`, `storage_path`, `mime_type`, `size`, `created_at`; `ON DELETE CASCADE`
   from auth.users down through subjects, topics and documents.
3. **Storage** (`supabase/migrations/0002_storage.sql`) — private bucket `documents`
   (10 MB per file, `application/pdf` only); folder-scoped policies restrict each user to
   `users/{userId}/documents/...`; no update policy (paths are immutable); downloads use
   short-lived signed URLs, never public URLs.

The SQL migrations are the source of truth for the security model — any change must go
through them.
