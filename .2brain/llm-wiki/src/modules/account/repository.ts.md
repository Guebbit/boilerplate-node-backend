---
source: src/modules/account/repository.ts
source_sha256: 0488ea925827a06ccb64bf63013046a4d671e51f6bd5faf4dd49f81609dcc698
context_sha256: a794afbf2e198b3defc7accfc42d2f773c7140902e3aba2d9195e58561a7f9cd
generated_at: 2026-11-22T03:34:29.485111+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/repository.ts

## Purpose
Data-access layer for the account module's Mongo collections: `accountexports`, `sessions` and `verificationtokens`. It holds plain lean reads and atomic writes only. Nothing here is paged or searched, so it does not use the shared repository factory. Services call these functions instead of touching the models directly.

## Key elements
- **`AccountExportRow`**: lean type of an export document.
- **`accountExportRepository`**: object with an explicit type annotation (to avoid TS7056). It exposes:
  - `findByUserId` and `findById`: read one row by owner or by its own id. The worker uses `findById`.
  - `insert`: inserts a row. It rejects with duplicate-key `11000` if the account already has one, because the unique index on `userId` enforces one live export.
  - `settleBuilding`: moves a row from `building` to `ready` or `failed` exactly once. It filters on `status: 'building'` and sets the new `expiresAt`. It accepts an optional transaction `session` and returns the settled row, or `null` if the row was no longer `building`.
  - `deleteById`: deletes one row by id.
  - `deleteByUserId`: deletes all of an account's rows inside the erasure transaction and returns the file names they pointed at.
  - `findExpired`: returns a batch of rows whose `expiresAt` has passed, up to a limit, for the reaper.
- **`SessionRow` / `NewSessionRow`**: lean session type, and the input type for a new session without `purgeAt`, `supersededAt`, `_id` or `__v`.
- **Session functions**:
  - `insertSession`: sets `purgeAt` to `expiresAt`.
  - `findSessionByHash`: finds the row by `tokenHash` in any state (live, superseded or expired).
  - `supersedeSession`: claims a `jwt` row for rotation exactly once. It uses an aggregation-pipeline update (`updatePipeline: true`) to stamp `supersededAt` and shorten `purgeAt` to the reuse-detection window, capped at `expiresAt`. It returns whether this call won the claim.
  - `touchSession`: stamps `lastUsedAt`, with an optional `minIntervalMs` throttle. It returns whether a write happened.
  - `listLiveSessions`: lists live sessions for an account, optionally filtered by mode, newest `startedAt` first.
  - `removeSessionByHash`: idempotent logout of one row.
  - `removeSessionFamily`: deletes a whole family, scoped to the owner.
  - `removeSessionFamilyExcept`: deletes a family except the row with `keepHash`.
- **`FamilyActivity`** (internal interface): a family's `lastActiveAt` (idle timeout), `stampedAt`, and `startedAt` (staff lifetime cap).
- The file continues past this point with more session-family queries. This page does not cover them.

## Relationships
- Uses `toObjectId` and the `Lean` type from `src/infrastructure/persistence/create-repository.ts` for id conversion and lean typing.
- Uses `isDuplicateKey` from `src/infrastructure/persistence/mongo-errors.ts`.
- Uses the models, document types and `ErasureLedgerKind` from `src/modules/account/model.ts` (`accountExportModel`, `sessionModel`, `verificationTokenModel`, `erasureLedgerModel`).
- Imports `SessionMode` from `src/modules/account/session-mode.ts`. It also imports `ONE_LIVE_TOKEN_TYPES` and `VerificationTokenType` from `./token-types`.
- Imports `AccountExportStatus` from `@types`.
- Its callers are presumably the services in `src/modules/account/services/` (export, export-job, export-rows, logout, revocation, sessions, tokens, erasure-ledger, previous-email-cleanup). The visible part of the file shows no direct interaction with them.
- `src/modules/account/presenter.ts` and `src/infrastructure/adapters/logger.ts` are graph neighbors, but no interaction with them is visible in the shown portion.

## Notes
- Concurrency safety comes from the database. Examples are the `status: 'building'` filter, the `supersededAt: { $exists: false }` filter, and the unique index on `userId`.
- Expiry is checked in queries as well as through `purgeAt`. The TTL monitor lags, so expired rows can still exist.
- Session deletes are scoped by `userId`, so a leaked `familyId` from another account removes nothing.
- `deleteByUserId` and `settleBuilding` take a `ClientSession` so their writes can commit with the caller's transaction.
