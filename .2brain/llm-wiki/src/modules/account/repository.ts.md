---
source: src/modules/account/repository.ts
sha256: 078cf2691c3a92b7a133d835fe15f070ce4c7c4df68802f0346871e2df9cf97f
generated_at: 2026-10-15T09:58:44.519922+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/repository.ts

## Purpose

Plain Mongoose query layer for three account-scoped collections (`accountexports`, `sessions`, and `verificationtokens`). It exposes lean reads and atomic writes (claim-once updates, throttled stamps, scoped deletes) that the account services need but that the shared repository factory does not provide—there is no pagination or general search here, just targeted single-document and small-batch operations.

## Key elements

- **`accountExportRepository`** (exported object): eight methods for the `accountexports` collection — `findByUserId`, `findById`, `findOwned`, `insert`, `settleBuilding`, `deleteById`, `deleteByUserId`, `findExpired`. Enforces the one-live-export-per-account invariant via a unique index on `userId`; `settleBuilding` is a compare-and-swap on `status: 'building'` so concurrent job runs settle exactly once.
- **`AccountExportRow`** (exported type): `Lean<AccountExportDocument>`.
- **Session functions** (module-level, consumed directly by services): `insertSession`, `findSessionByHash`, `supersedeSession`, `touchSession`, `listLiveSessions`, `removeSessionByHash`, `removeSessionFamily`, `removeSessionFamilyExcept`.
- **`supersedeSession`** — aggregation-pipeline `findOneAndUpdate` that stamps `supersededAt` and caps `purgeAt` to the reuse-detection window; returns `true` only to the caller that actually claimed the row.
- **`touchSession`** — throttled `lastUsedAt` write; the filter includes `$or` on `lastUsedAt` so a busy tab does not write on every request.
- **`FamilyActivity`** (exported interface): `{ lastActiveAt, stampedAt? }` — the shape `family-liveness` and staff idle-timeout logic read.
- **`deleteByUserId`** — transactional (accepts a Mongoose `ClientSession`); returns the `file` names of deleted rows so the caller can unlink them post-commit.

## Relationships

- **`src/modules/account/model.ts`** — source of all Mongoose models (`accountExportModel`, `sessionModel`, `verificationTokenModel`) and the document/status types this file reads and writes.
- **`src/infrastructure/persistence/create-repository.ts`** — supplies `toObjectId` (string → `Types.ObjectId`) and the `Lean<T>` helper type used throughout.
- **`src/infrastructure/persistence/mongo-errors.ts`** — supplies `isDuplicateKey`, which callers use to distinguish the expected "already has an export" rejection from other insert failures.
- **`src/modules/account/session-mode.ts`** — provides the `SessionMode` type that parameterises `listLiveSessions`.
- **`src/modules/account/services/export.ts` / `export-job.ts` / `export-rows.ts`** — consume `accountExportRepository` to create, settle, list, and reap export rows.
- **`src/modules/account/services/logout.ts` / `revocation.ts` / `sessions.ts` / `tokens.ts`** — consume the session functions for login, logout, rotation, listing, and re-proof cleanup.
- **`src/modules/account/session/family-liveness.ts`** — reads `FamilyActivity` and calls the session-family queries to enforce idle-timeout and liveness checks.
- **`src/modules/account/session/cookie-strategy.ts`** — inserts and looks up cookie-mode session rows.
- **`src/modules/account/services/previous-email-cleanup.ts`** — deletes session rows tied to a changed email address.

## Notes

- The file deliberately does **not** use the shared repository factory (`create-repository`); it imports only the `toObjectId` and `Lean` utilities from that module. All queries are hand-written single-statement Mongoose calls.
- `supersedeSession` uses Mongoose's `updatePipeline: true` option because the new `purgeAt` is computed with `$min` against the row's own `expiresAt`—a plain `$set` cannot express that.
- `insert` pre-generates the `_id` (caller's responsibility) so the `file` field can embed it before the write; the duplicate-key error (`11000`) on `userId` is the race-safety mechanism for "one live export."
- `listLiveSessions` checks `expiresAt > now` in the query because the MongoDB TTL index lags; an expired row may still physically exist.
- All session delete operations are idempotent and return a count (0 = nothing matched); callers do not need to handle "not found" separately.
- The `deleteByUserId` two-step (find files → deleteMany) runs inside a caller-supplied Mongoose transaction; the returned file names are the contract the after-commit disk-cleanup step relies on.
