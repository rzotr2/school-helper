# School Helper

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
- Firebase: Authentication (Google), Firestore, Storage
- Vitest + Firebase Emulator Suite for security-rule and integration tests
- ESLint; package manager: **npm** (`package-lock.json` is canonical)

## Architecture

```
UI (src/ui)
↓
Application / Use Cases (src/application/use-cases)
↓
Infrastructure (src/infrastructure: firebase config, auth)
↓
Firebase
```

UI calls use cases; Firestore business logic lives in `src/application/use-cases`, never in UI components.

## Data model

| Collection | Path | Key fields |
|---|---|---|
| School profile | `schoolProfiles/{userId}` | `createdAt`, `updatedAt` |
| Subjects | `subjects/{subjectId}` | `ownerId`, `name`, `position`, timestamps |
| Topics | `topics/{topicId}` | `ownerId`, `subjectId`, `name`, `position`, timestamps |
| Documents | `documents/{documentId}` | `ownerId`, `topicId`, `originalName`, `storagePath`, `mimeType`, `size`, timestamps |

Storage path: `users/{userId}/documents/{documentId}.pdf` — it stays fixed when a document is renamed or moved.

## Local development

```bash
npm install
npm run dev        # http://localhost:3000
```

Firebase config lives in `firebase-applet-config.json` (project, Firestore database, storage bucket).

### Commands

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server on port 3000 |
| `npm run build` | Production build |
| `npm run lint` | `tsc --noEmit` + ESLint (incl. Firebase security-rules linting) |
| `npm test` | Vitest — requires the Firebase emulators running (see below) |
| `npm run clean` | Remove `dist/` |

### Firebase Emulator Suite

The test suite (73 tests in 5 files at the repo root) covers Firestore rules, Storage rules, cascade deletion, the global library, and document management against real emulators.

```bash
npx firebase emulators:start --only firestore,storage
npm test    # in a second terminal
```

**The emulators require a Java runtime** (`java -version` must work). Tests connect to Firestore on `127.0.0.1:8080` and Storage on `127.0.0.1:9199` (see `firebase.json`).

## Security model

Defense in depth, all data private:

1. **Application layer** — every use case verifies ownership (`ownerId`) before reads/writes.
2. **Firestore rules** (`firestore.rules`) — deny-by-default global rule; per-collection validation; users can only access their own data; documents validate topic ownership on create/move. Fields `ownerId`, `storagePath`, `mimeType`, `size`, `createdAt` are immutable after creation.
3. **Storage rules** (`storage.rules`) — only the owning user can read/write `users/{userId}/documents/*`; PDF only, 10 MB max.

Any security-rule change must be accompanied by passing emulator tests.
