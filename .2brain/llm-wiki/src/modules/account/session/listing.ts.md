---
source: src/modules/account/session/listing.ts
sha256: 746bd599e676b8c57a87512c804127722b826baee5f2ea562a7014a077f97524
generated_at: 2026-11-14T18:58:09.529954+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/session/listing.ts

## Purpose

Lists an account's live sessions for one session mode, returning them as the wire `Session` array. It deduplicates JWT refresh families, filters out rows that are effectively dead (pre-epoch, idled, past staff cap), and marks the caller's own session as `current`.

## Key elements

- **`newestPerFamily(rows)`** — Reduces a list of `SessionRow`s to one row per `familyId`, keeping the row with the largest `_id` (time-ordered). Preserves input order.
- **`listSessions(mode, userId, credential)`** — Main entry point. Fetches live rows, the user record, and the caller's roles in parallel; filters; deduplicates; and maps each surviving row through `presentSession`. Returns `Promise<Session[]>`.
- **`endsAt(row, roles)`** *(module-private)* — Computes the effective session end time as the earlier of the row's `expiresAt` and the staff lifetime cap (when applicable).

## Relationships

- **`src/infrastructure/security/hash-token.ts`** — `hashToken` hashes the caller's credential so it can be compared against stored token hashes to determine which family is `current`.
- **`src/kernel/access/tenant.ts`** — Supplies `DEPLOYMENT_TENANT_ID` for the roles lookup.
- **`src/modules/access/index.ts`** — Provides `accessService`, used to obtain the caller's roles.
- **`src/modules/account/domain/epoch.ts`** — `predatesSessionEpoch` filters out rows stamped before a ban/epoch reset (`tokensValidAfter`).
- **`src/modules/account/presenter.ts`** — `presentSession` shapes a `SessionRow` into the wire `Session`.
- **`src/modules/account/repository.ts`** — Provides `sessionRepository` (the data source for live session rows) and the `SessionRow` type.
- **`src/modules/account/session-mode.ts`** — `SessionMode` type parameterises which rows belong to the caller.
- **`src/modules/account/session/idle.ts`** — `hasIdledOut`, `hasOutlivedStaffCap`, and `staffCapEndsAt` drive the dead-row filter and the `endsAt` calculation.
- **`src/modules/users/friends/account.ts`** — Provides `accountUserService`, used to fetch the user record (needed for `tokensValidAfter`).
- **`src/types/auth-context.ts`** — `AuthContext` and `Session` types used in signatures and return values.
- **`src/modules/account/tests/unit/session-listing.test.ts`** — Unit tests for this module.

## Notes

- **`_id` as a timestamp proxy.** `newestPerFamily` uses string comparison on `_id` to pick the "newest" row in a family. This relies on `_id` being time-ordered (e.g. a `Date.now()`-based id). It is not a general sort.
- **Lazy expiry.** Idled or staff-capped sessions are not deleted server-side; they are filtered out at read time in `listSessions`. A session only "ends" when someone next presents it, so the list filter is the only gate.
- **`current` is best-effort.** If the caller has no credential (API key, bare access token), `digest` is `undefined` and every row is honestly reported as `current: false`.
- **JWT grace-window duplicates.** A single JWT sign-in can produce two live rows (original + refresh successor) within the grace window. `newestPerFamily` collapses them so the UI shows one entry per sign-in.
