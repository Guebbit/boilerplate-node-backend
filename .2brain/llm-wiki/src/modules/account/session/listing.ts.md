---
source: src/modules/account/session/listing.ts
sha256: 077fc7cea39e529c36e9c01e67260cb8017d19457307b20f3efe240b7febb65a
generated_at: 2026-10-15T10:07:56.924681+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/session/listing.ts

## Purpose

Provides the account's live-session list (the wire `Session` array) shared across both session modes. It fetches live rows, filters out rows invalidated by a ban (epoch) or by an idle-timeout, deduplicates JWT-family rows that can hold two live refreshes simultaneously, and marks the caller's own session as `current`.

## Key elements

- **`newestPerFamily(rows)`** – exported. Given live rows (newest sign-in first), returns one row per `familyId` by keeping the row with the largest `_id` (time-ordered). Prevents a JWT grace-window duplicate from appearing twice.
- **`toSession(row, currentFamilies)`** – private. Maps a `SessionRow` to the wire `Session` shape; `lastUsedAt` and `device` are omitted when absent so an unused session reads as unused.
- **`listSessions(mode, userId, credential)`** – exported. The main entry point. Runs three lookups in parallel (live rows, user record, roles), filters rows by session-epoch and idle-timeout, digests the caller's credential with `hashToken` to identify `current` families, deduplicates per family, and returns `Session[]`.

## Relationships

- **`src/modules/account/repository.ts`** — calls `sessionRepository.listLive(userId, mode, now)` and consumes the `SessionRow` type.
- **`src/modules/account/session/epoch.ts`** — calls `predatesSessionEpoch` to drop rows stamped before the user's `tokensValidAfter`.
- **`src/modules/account/session/idle.ts`** — calls `hasIdledOut` to drop staff sessions past their idle limit.
- **`src/infrastructure/security/hash-token.ts`** — calls `hashToken(credential)` to produce the digest matched against `row.tokenHash` for `current` marking.
- **`src/modules/users/index.ts`** — calls `userService.findAuthenticatableById(userId)` to obtain `tokensValidAfter` (the session epoch).
- **`src/modules/access/index.ts`** — calls `rolesOf(userId, DEPLOYMENT_TENANT_ID)` to supply roles into the idle-timeout check.
- **`src/kernel/access/tenant.ts`** — imports `DEPLOYMENT_TENANT_ID` used in the `rolesOf` call.
- **`src/modules/account/session-mode.ts`** — imports the `SessionMode` type for the `mode` parameter.
- **`src/types/index.ts`** — imports the `Session` wire type.
- **`src/modules/account/tests/unit/session-listing.test.ts`** — unit-tests the functions exported by this file.

## Notes

- **Family deduplication is order-sensitive.** `newestPerFamily` relies on rows arriving newest-sign-in-first; it then uses lexicographic `_id` comparison (`String` compare) to pick the most recent row per family. If the repository ever returns rows in a different order the "largest `_id` wins" rule still holds, but the final order follows the *input* order, not the dedup winner's position.
- **`current` requires the caller to present a credential.** A key-based or bare-access-token caller (no `credential`) will have every row as `current: false` — by design, not a bug.
- **`lastUsedAt` is optional on the wire.** The spread conditional means the field is entirely absent (not `null`) when the session has never been used.
- **Idle filtering uses `lastUsedAt ?? startedAt`.** A row that was never used is judged against its issue time, so a very old never-touched session can be filtered out even without an explicit idle expiry.
- **Row rows stamped before `authTime` existed are kept** (`row.authTime === undefined` short-circuits the epoch check) to avoid false-positive deletions for legacy data.
