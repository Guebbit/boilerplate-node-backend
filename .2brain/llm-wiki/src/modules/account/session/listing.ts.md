---
source: src/modules/account/session/listing.ts
sha256: a722c02fd6045ba702c19efe667c6e99d26d872c324638ce2d9925e501435ccb
generated_at: 2026-10-14T09:01:21.981316+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/session/listing.ts

## Purpose

Renders an account's live sessions as the wire `Session` list for a single session mode. It deduplicates JWT families that can hold two live rows simultaneously (grace-window refreshes) and marks which session is the caller's current one. Both cookie and JWT session modes share this code; they differ only in which rows are queried and how the caller identifies itself.

## Key elements

- **`newestPerFamily(rows: readonly SessionRow[]): SessionRow[]`** — Pure function. Given live rows (newest sign-in first), collapses them to one row per `familyId`, keeping the one with the largest `_id`. Preserves input order.
- **`listSessions(mode, userId, credential): Promise<Session[]>`** — The main entry point. Fetches live rows via `sessionRepository.listLive`, hashes the caller's credential to determine which `familyId`s are "current", deduplicates families, and maps each surviving row to the wire shape.
- **`toSession(row, currentFamilies)`** — (private) Maps a `SessionRow` to the `Session` wire object. `lastUsedAt` and `device` are omitted (not `null`) when absent. `current` is true only when the row's `familyId` is in the caller's credential set.

## Relationships

- **`src/modules/account/repository.ts`** — Calls `sessionRepository.listLive(userId, mode, date)` to fetch rows; consumes the `SessionRow` type.
- **`src/infrastructure/security/hash-token.ts`** — Calls `hashToken(credential)` to produce the digest matched against `row.tokenHash` for the `current` flag.
- **`src/modules/account/session-mode.ts`** — Imports the `SessionMode` type used as the first parameter of `listSessions`.
- **`src/types/index.ts`** — Imports the `Session` wire type that `toSession` produces.
- **`src/modules/account/services/sessions.ts`** — Graph neighbor; the service layer that likely invokes `listSessions` as part of the session endpoint.
- **`src/modules/account/session/cookie-strategy.ts` / `jwt-strategy.ts`** — The two session modes whose rows this module lists. The "two rows per family" deduplication exists specifically for the JWT grace-window case.
- **`src/modules/audit-logs/tests/integration/incidents.test.ts`** — Integration test that exercises this code path.

## Notes

- `newestPerFamily` compares `_id` as a **string** (`String(row._id) > String(kept._id)`), relying on `_id` being time-ordered (e.g. ObjectId). This is an intentional assumption, not a general sort.
- `lastUsedAt` is spread conditionally so the key is **absent** (not `null`/`undefined`) for a session that has never been used — the API contract distinguishes "unused" from "used at the same instant as creation."
- A caller that presents no credential (API key, bare access token) gets `current: false` on every row; there is no fallback to "the most recent."
- The `current` check is per-family, not per-row: if two live rows share a `familyId` and the credential matches one of them, both map to the same `Session.id` and the dedup step ensures only the newest survives.
