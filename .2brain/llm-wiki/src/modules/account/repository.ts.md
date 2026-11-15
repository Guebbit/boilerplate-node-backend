---
source: src/modules/account/repository.ts
sha256: 2759a9f56f84ccdf881d731c2beb7f66678f6c14bcb3325ef636211cccccf9c6
generated_at: 2026-11-14T18:40:31.828807+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/repository.ts

## Purpose

Low-level query functions for three Mongoose collections (`accountexports`, `sessions`, `verificationtokens`). It exposes plain lean reads and atomic writes only—no pagination, no compound search—so it bypasses the shared repository factory entirely. Services in the account module call into this file instead of touching Mongoose models directly.

## Key elements

- **`AccountExportRow`** / **`SessionRow`** — `Lean<…>` view types returned to callers.
- **`accountExportRepository`** — exported object bundling export-row queries:
  - `findByUserId` / `findById` — single-document lookups.
  - `insert` — creates a row; unique index on `userId` enforces one live export per account under concurrency.
  - `settleBuilding` — atomic `findOneAndUpdate` gated on `status: 'building'` so only the first of N racing workers transitions the row; accepts a `ClientSession` for transactional commit.
  - `deleteById` / `deleteByUserId` — single or bulk removal; `deleteByUserId` returns the `file` names of deleted rows for post-commit disk cleanup.
  - `findExpired` — batch of rows past `expiresAt`, bounded by `limit` for the reaper loop.
- **`NewSessionRow`** — insert shape (omits `_id`, `purgeAt`, `supersededAt`, `__v`).
- **Session queries** (not grouped under a single exported object):
  - `insertSession` — sets `purgeAt = expiresAt` so the TTL index deletes the row at the same moment it stops being valid.
  - `findSessionByHash` — lookup by credential digest; row may be live, superseded, or expired.
  - `supersedeSession` — claim-and-stamp for rotation using an aggregation-pipeline update (`$min` of `expiresAt` and `at + retentionMs`); returns `true` only for the winner.
  - `touchSession` — idempotent `lastUsedAt` stamp with optional `minIntervalMs` throttle to avoid write-per-request.
  - `listLiveSessions` — active sessions for an account (optionally filtered by `mode`), sorted newest first; checks `expiresAt > now` because the TTL monitor lags.
  - `removeSessionByHash` — single-row logout; idempotent.
  - `removeSessionFamily` — delete all rows in a `familyId` scoped to the owner.
  - `removeSessionFamilyExcept` — delete family rows except the one matching `keepHash` (post-rotation cleanup).
- **`FamilyActivity`** — small interface describing the clock fields a live family exposes (`lastActiveAt`, `stampedAt?`, `startedAt`).
- The file was truncated after `FamilyActivity`; additional session-family queries (e.g. a "continue session" lookup) and the `verificationtokens` section follow.

## Relationships

- **`src/infrastructure/persistence/create-repository.ts`** — imports the `toObjectId` helper and the `Lean` type utility used throughout for lean-document typing.
- **`src/infrastructure/persistence/mongo-errors.ts`** — imports `isDuplicateKey` (referenced in the `insert` doc-comment as the error callers should catch).
- **`src/modules/account/model.ts`** — imports all Mongoose models (`accountExportModel`, `sessionModel`, `verificationTokenModel`, `erasureLedgerModel`) and their document type aliases.
- **`src/modules/account/session-mode.ts`** — imports the `SessionMode` type for filtering.
- **`src/modules/account/services/*`** (export, export-job, export-rows, logout, sessions, tokens, revocation, erasure-ledger, previous-email-cleanup) — consumers that call the exported functions rather than the models directly.
- **`src/modules/account/presenter.ts`** — likely maps the row types returned here into wire-format responses.

## Notes

- The explicit structural type annotation on `accountExportRepository` (rather than a plain object literal) exists to satisfy a TypeScript check (`TS7056`); the comment calls out that every module's repository does the same.
- `supersedeSession` uses an aggregation-pipeline update (`updatePipeline: true`) because `purgeAt` is a function of the row's own `expiresAt`; a plain `$set` cannot express that.
- `settleBuilding` and `supersedeSession` are the two critical race-safety points: the former gates on `status: 'building'`, the latter on `supersededAt: { $exists: false }`. Both return a nullable/boolean result so the caller can detect "I lost the race."
- `touchSession`'s throttle filter uses `$or` with `$exists: false` to handle rows that have never been stamped.
- The file deliberately does **not** use the shared repository factory (`create-repository.ts` provides only `toObjectId`/`Lean` here, not the factory), because there is no pagination or multi-criteria search.
