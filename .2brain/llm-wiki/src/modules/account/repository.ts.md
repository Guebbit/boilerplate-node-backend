---
source: src/modules/account/repository.ts
sha256: 418fdb15d86983aa4f9f8261c4ce9896c43acd86f3b04fd74e34b444175b2f3f
generated_at: 2026-10-29T02:38:49.358381+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/repository.ts

## Purpose

Thin MongoDB query layer for three collections — `accountexports`, `sessions`, and `verificationtokens`. All operations are single-row lean reads or atomic writes (insert, `findOneAndUpdate`, `deleteOne/Many`); nothing here paginates or free-text-searches, so the shared repository factory adds nothing and is intentionally not used.

## Key elements

- **`accountExportRepository`** (exported) — object bundling seven functions over the `accountexports` collection:
  - `findByUserId` / `findById` — single-row lookups by account or by row id (worker path).
  - `insert` — create a row; the unique index on `userId` enforces "one live export" under a race (rejects with code `11000`).
  - `settleBuilding` — atomic `findOneAndUpdate` gated on `status: 'building'`; exactly one of N racing workers succeeds. Accepts an optional `ClientSession` to join the caller's transaction.
  - `deleteById` / `deleteByUserId` — single or bulk removal; the bulk variant returns the `file` names so the caller can clean the disk after commit.
  - `findExpired` — bounded batch of rows past `expiresAt`, for the reaper loop.

- **Session functions** (exported individually):
  - `insertSession` — create a row; sets `purgeAt = expiresAt` so the TTL monitor deletes it at the same moment it stops being honoured.
  - `findSessionByHash` — look up by credential digest regardless of live/superseded/expired state.
  - `supersedeSession` — claims a `jwt` row for rotation via an aggregation-pipeline `findOneAndUpdate`; stamps `supersededAt` and shrinks `purgeAt` to `min(expiresAt, at + retentionMs)`. Returns `true` only for the single winning caller.
  - `touchSession` — updates `lastUsedAt`; throttled by `minIntervalMs` to avoid a write per request from a busy tab.
  - `listLiveSessions` — un-superseded, unexpired rows for an account (optionally one `mode`), newest first.
  - `removeSessionByHash` — idempotent single-row logout.
  - `removeSessionFamily` / `removeSessionFamilyExcept` — scoped multi-row deletes by `familyId` ("log out that device" / rotation cleanup).

- **`FamilyActivity`** (interface) — clock summary (last active, last stamped, original sign-in) consumed by idle-timeout and lifetime-cap logic.

- **Types exported**: `AccountExportRow`, `SessionRow`, `NewSessionRow`.

- **Verification-token section** (truncated in this snapshot) — additional queries over `verificationtokens`, importing `ONE_LIVE_TOKEN_TYPES` and `VerificationTokenType`.

## Relationships

| Neighbor | Interaction |
|---|---|
| `./model.ts` | Source of all Mongoose models (`accountExportModel`, `sessionModel`, `verificationTokenModel`) and document types. |
| `@infrastructure/persistence/create-repository` | Provides `toObjectId` (string→ObjectId coercion) and the `Lean<T>` type wrapper used on every query. |
| `@infrastructure/persistence/mongo-errors` | `isDuplicateKey` — checked by callers when `insert` rejects with code `11000`. |
| `./session-mode.ts` | Supplies the `SessionMode` union used in `listLiveSessions` filters. |
| `./token-types` | Supplies `ONE_LIVE_TOKEN_TYPES` and `VerificationTokenType` for the verification-token queries. |
| `services/export.ts`, `services/export-job.ts`, `services/export-rows.ts` | Consume `accountExportRepository` for creating, settling, and reading export rows. |
| `services/sessions.ts`, `services/logout.ts`, `services/revocation.ts` | Consume the session functions for listing, rotating, and removing sessions. |
| `services/tokens.ts`, `services/previous-email-cleanup.ts` | Consume the verification-token queries. |
| `session/cookie-strategy.ts` | Reads/writes session rows when interpreting or refreshing cookies. |
| `presenter.ts` | Formats the rows returned by this module for API responses. |

## Notes

- **No shared factory.** The module doc-comment states explicitly that the shared repository factory "has nothing to add" because there is no paging or search. Do not refactor these into the factory pattern.
- **`supersedeSession` uses an aggregation-pipeline update** (`$min` on `$expiresAt`) rather than a plain `$set`, because the new `purgeAt` is row-dependent. The `updatePipeline: true` Mongoose option is required; removing it breaks the update.
- **`settleBuilding` atomicity** relies entirely on the `status: 'building'` filter in the query. If that filter is widened or removed, the "exactly once" guarantee for export settling breaks.
- **`touchSession` throttling** is encoded in the query filter (`$or` on `lastUsedAt`), not in application-level caching. Setting `minIntervalMs` to `0` bypasses the filter and always writes.
- **Explicit type annotation on `accountExportRepository`** silences TS7056 (implicit `any` on object-literal method inference). The comment flags this as a known convention shared by other module repositories.
- **`deleteByUserId` is two-step** (find → deleteMany) within one transaction; the returned file names are the contract the caller uses for post-commit disk cleanup. Do not split these into separate operations.
- **Session `purgeAt` ≠ a separate TTL field.** It is set to `expiresAt` at insert time and only shortened by `supersedeSession`. The MongoDB TTL index reads this single field.
