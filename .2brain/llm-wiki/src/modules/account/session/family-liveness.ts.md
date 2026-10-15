---
source: src/modules/account/session/family-liveness.ts
sha256: 76ee790905c1ba62d33945f57fac6925bc588ba34ead87cb8f3b69ae2d8e3684
generated_at: 2026-10-15T10:06:48.970814+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/session/family-liveness.ts

## Purpose

Determines whether a session **family** is still alive: it has a live row in the repository and, for staff-mode sessions, has not idled out. Shared by the JWT bearer path (access token's `sid` field) and by SSE stream rechecks, since a credential rotates under a stable family.

## Key elements

- **`ACTIVITY_STAMP_INTERVAL_MS`** (`60_000`) — minimum interval between activity-stamp writes for a busy session.
- **`resolveInLiveFamily(userId, familyId, mode, resolveCaller, options?)`** — resolves the caller named by a credential's proof while validating the family. Returns:
  - `{ miss: 'revoked' }` if no live row exists.
  - `{ miss: 'idle' }` if the family has idled out (and is revoked in the same call).
  - `{ ok }` otherwise, having asynchronously stamped activity (fire-and-forget).
  - `options.passive` (default `false`) — when true, the request is judged but **not** counted as activity.

## Relationships

- **`src/modules/account/repository.ts`** — calls `sessionRepository.familyActivity`, `.removeFamily`, and `.touchFamily` for all read/write operations on family rows.
- **`src/modules/account/session/idle.ts`** — calls `hasIdledOut` to decide whether a staff session should be revoked.
- **`src/kernel/authentication.ts`** — consumes the `Resolution` return-type.
- **`src/types/auth-context.ts` / `src/types/index.ts`** — consumes `AuthContext` and `ResolveOptions` types.
- **`src/modules/account/session-mode.ts`** — consumes the `SessionMode` type.
- **`src/modules/account/session/jwt-strategy.ts` / `cookie-strategy.ts`** — upstream consumers that invoke `resolveInLiveFamily` during credential resolution.
- **`src/modules/account/tests/unit/family-liveness.test.ts`** — unit tests for this module.

## Notes

- Activity stamping (`touchFamily`) is intentionally **off the request path** (`void …catch(() => false)`). A lost stamp only costs a stale reading, never a failed request.
- The idle check and the stamp write both require `ok` (a successfully resolved caller); a `passive` request skips stamping but still triggers idle-revocation if the session has expired.
- `hasIdledOut` is only evaluated when `ok` is truthy — an unresolvable caller short-circuits before the idle check.
