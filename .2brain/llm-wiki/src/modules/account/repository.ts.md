---
source: src/modules/account/repository.ts
sha256: 3e75414d48dbf3c2a6d9050b8046e42fa3bdef06d1b91a78e90b7865854b95b9
generated_at: 2026-11-08T04:14:59.218452+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/repository.ts

## Purpose

Data-access layer for the `accountexports`, `sessions`, and (partially, per the import) `verificationtokens` collections. It exposes plain lean reads and atomic writes only — no paging, no full-text search — so the shared repository factory in `create-repository` adds no behaviour here. The file is consumed by the account services (exports, sessions, erasure, revocation, logout, etc.) as their sole path to Mongo for these collections.

## Key elements

- **`accountExportRepository`** (exported object) — the typed API for the `accountexports` collection:
  - `findByUserId` / `findById` — single-row lookups (by owner or by id, the latter used by the export worker).
  - `insert` — creates a row; the unique index on `userId` enforces "at most one live export" under race.
  - `settleBuilding` — conditional `findOneAndUpdate` that moves a row out of `building` exactly once; accepts a `ClientSession` so the caller can join a transaction.
  - `deleteById` / `deleteByUserId` — single-row and account-wide deletion; the latter returns the `file` names so the caller can clean up the disk after commit.
  - `findExpired` — batch of rows past `expiresAt`, bounded by `limit` for the reaper loop.
- **Session functions** (exported individually, not grouped under an object):
  - `insertSession` — creates a row and sets `purgeAt = expiresAt` (DB-side TTL).
  - `findSessionByHash` — lookup by credential digest regardless of state.
  - `supersedeSession` — atomic claim for rotation; stamps `supersededAt`, shortens `purgeAt` to the reuse-detection window. Returns `boolean` (did *this* call win?).
  - `touchSession` — throttled `lastUsedAt` update; `minIntervalMs` skips the write when the row was stamped more recently.
  - `listLiveSessions` — unexpired, un-superseded rows for an account, optionally filtered by mode, newest first.
  - `removeSessionByHash` / `removeSessionFamily` / `removeSessionFamilyExcept` — targeted and family-scoped deletions.
- **`FamilyActivity`** (exported interface) — shape returned by the family-activity query (last active, stamped, started).
- **Types** — `AccountExportRow`, `SessionRow`, `NewSessionRow` (all `Lean<…>` or `Omit<…>` variants of the Mongoose documents).

## Relationships

- **`src/infrastructure/persistence/create-repository.ts`** — provides `toObjectId` (string → `Types.ObjectId`) and the `Lean<T>` type alias used throughout this file.
- **`src/infrastructure/persistence/mongo-errors.ts`** — exports `isDuplicateKey`, imported here so callers can inspect the `11000` error raised by `insert`.
- **`src/modules/account/model.ts`** — source of all Mongoose models (`accountExportModel`, `sessionModel`, `erasureLedgerModel`, `verificationTokenModel`) and their document/kind types.
- **`src/modules/account/session-mode.ts`** — provides the `SessionMode` union used to filter `listLiveSessions`.
- **Services (consumers)** — `export.ts` / `export-job.ts` / `export-rows.ts` call the `accountExportRepository` functions; `sessions.ts` / `tokens.ts` call the session functions; `erasure-ledger.ts` calls `deleteByUserId` inside a transaction; `logout.ts` and `revocation.ts` call the removal helpers. (These relationships are implied by the docstrings and the dependency graph; the services are not imported *by* this file.)

## Notes

- **Race-safety pattern** — `settleBuilding` and `supersedeSession` both use a conditional filter (`status: 'building'` / `supersededAt: { $exists: false }`) so that exactly one concurrent caller succeeds; all others get `null`/`false`. Callers must handle the "lost the race" branch.
- **Aggregation-pipeline update** — `supersedeSession` computes the new `purgeAt` from the row's own `expiresAt` via `$min`, requiring `{ updatePipeline: true }` in the Mongoose options.
- **TTL lag** — the DB TTL monitor is async; queries that mean "live" re-check `expiresAt > now` rather than trusting absence of the row.
- **Explicit type annotation** on `accountExportRepository` exists to satisfy TS7056 (implicit `any` from the object-literal inference); the comment in the source calls this out explicitly.
- **`deleteByUserId` returns file names** so the *caller* performs disk cleanup after the transaction commits — the repository itself never touches the filesystem.
- The file is for `accountexports`, `sessions`, and `verificationtokens`; the `verificationtokens` portion is in the truncated tail and not detailed here.
