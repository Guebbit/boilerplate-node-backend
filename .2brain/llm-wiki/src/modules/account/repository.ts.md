---
source: src/modules/account/repository.ts
sha256: 903f5c358947ef57a90fec155331f3e3b4d61df78aaf9e9acfd76fcabdce0923
generated_at: 2026-10-14T14:37:32.482612+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/repository.ts

## Purpose

Plain Mongoose queries for the `accountexports`, `sessions`, and `verificationtokens` collections. Because every query is a simple lean read or atomic write (no pagination, no aggregation search), the shared repository factory adds nothing here — this file is a direct set of model calls shaped into small, single-purpose functions.

## Key elements

- **`AccountExportRow`** — `Lean<AccountExportDocument>`; the shape services read.
- **`accountExportRepository`** — exported object with:
  - `findByUserId` / `findById` / `findOwned` — single-row lookups (by owner, by id, by owner+id).
  - `insert` — creates a row; the unique index on `userId` enforces "one live export."
  - `settleBuilding` — atomic `building → ready|failed` transition; only the first caller in a race wins.
  - `deleteById` / `deleteByUserId` — single or bulk delete; the latter returns file names for after-commit disk cleanup.
  - `findExpired` — batch of rows past `expiresAt` for the reaper loop.
- **`SessionRow` / `NewSessionRow`** — lean session shapes; `NewSessionRow` omits `_id`, `purgeAt`, `supersededAt`.
- **Session functions** (exported via a session repository object, partially truncated):
  - `insertSession` — sets `purgeAt = expiresAt` on write.
  - `findSessionByHash` — lookup by credential digest, any state.
  - `supersedeSession` — atomic rotation claim via aggregation-pipeline update; returns `true` only for the winner.
  - `touchSession` — throttled `lastUsedAt` stamp (`minIntervalMs` guard in the filter).
  - `listLiveSessions` — live rows of one `SessionMode`, sorted newest first.
  - `removeSessionByHash` — idempotent single-row logout.
  - `removeSessionFamily` / `removeSessionFamilyExcept` — scoped bulk deletes by `familyId`.
  - `sessionFamilyIsLive` — existence check for `sid` claim validation (any unexpired row counts).
- **Verification-token functions** — imported `verificationTokenModel` and `ONE_LIVE_TOKEN_TYPES` indicate a third repository block (truncated in source).

## Relationships

- **`src/infrastructure/persistence/create-repository.ts`** — provides `toObjectId` (string → `Types.ObjectId`) and the `Lean<T>` utility type used throughout.
- **`src/infrastructure/persistence/mongo-errors.ts`** — provides `isDuplicateKey`, used to detect unique-index collisions (notably on `insert`).
- **`src/modules/account/model.ts`** — source of `accountExportModel`, `sessionModel`, `verificationTokenModel` and their document/status types.
- **`src/modules/account/session-mode.ts`** — supplies the `SessionMode` union used to scope session queries.
- **`src/modules/account/token-types.ts`** — supplies `ONE_LIVE_TOKEN_TYPES` and `VerificationTokenType` for the verification-token block.
- **Service consumers** — `export.ts`, `export-job.ts`, `export-rows.ts` drive the export-repository functions; `sessions.ts`, `logout.ts`, `revocation.ts`, `tokens.ts`, `previous-email-cleanup.ts` drive the session/token functions; `session/cookie-strategy.ts` and `session/jwt-strategy.ts` call session lookups and rotation.
- **`src/infrastructure/adapters/logger.ts`** — listed as a graph neighbor (likely referenced in the truncated verification-token section or in error-logging paths).

## Notes

- `settleBuilding` uses a status filter in the query, not just the update — this is the concurrency guard; do not remove it.
- `supersedeSession` passes an **aggregation-pipeline** array to `findOneAndUpdate`; Mongoose requires the `updatePipeline: true` option, otherwise it throws.
- `touchSession` bakes the throttle into the **filter** (`$or` on `lastUsedAt`), so a skipped write is indistinguishable from a no-match — callers check the returned boolean.
- `purgeAt` on sessions is set to `expiresAt` at insert time (TTL index does the reaping); `supersedeSession` may shorten it to the reuse-detection window but never past `expiresAt`.
- The file deliberately does **not** use the shared repository factory — the header comment explains why. Do not refactor to use it.
- `sessionFamilyIsLive` intentionally matches **any** unexpired row (rotated-away or not) so a mid-refresh access token is not refused between supersede and insert.
