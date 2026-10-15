---
source: src/modules/account/tests/unit/session-listing.test.ts
sha256: e5e0889ecbf5bbd53eafe0981b4bf31fc18c70a8bf1b40c14adce35fb6175d91
generated_at: 2026-10-15T10:16:08.799372+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/unit/session-listing.test.ts

## Purpose

Unit tests for the public session-listing functions (`listSessions`, `newestPerFamily`) in `@modules/account/session/listing`. Verifies family deduplication, caller-current marking, optional-field presence, account-epoch filtering, and the staff idle-timeout hide rule—each in isolation with mocked repositories and services.

## Key elements

- **`newestPerFamily`** — tested for two invariants: exactly one row per `familyId` (the later `_id` wins regardless of input position) and preservation of the input family order.
- **`listSessions(mode, userId, token?)`** — tested for: publishing `id`/`createdAt`/`expiration`; marking the caller's family `current: true` (even when the caller holds the older row in a rotation race); marking nothing current when no token is supplied; carrying `lastUsedAt`/`device` only when the row has them; dropping rows whose `authTime` predates `tokensValidAfter`; keeping rows with no `authTime` (no epoch to judge); and hiding staff sessions past the idle limit while keeping customer sessions regardless of age.
- **`row(familyId, overrides?)`** — local factory that builds a `SessionRow` with a fresh `Types.ObjectId` for `_id`, a shared `USER_ID`, `mode: 'jwt'`, a random `tokenHash`, and fixed 2026 dates. Used to produce controlled fixtures.
- **Mocks (partial, via `...actual` spread)** — `sessionRepository.listLive`, `userService.findAuthenticatableById`, and `rolesOf` are replaced with `jest.fn()` while all other exports from those modules remain intact.
- **`asStub`** (from `@tests/stub`) — used to extract typed mock references and to type the `row` factory's return value without casting the caller.
- **`hashToken`** (from `@infrastructure/security/hash-token`) — produces the `tokenHash` values that `listSessions` compares against the caller's raw token to set `current`.

## Relationships

- **`src/modules/account/session/listing.ts`** — the system under test; provides `listSessions` and `newestPerFamily`.
- **`src/modules/account/repository.ts`** — `sessionRepository.listLive` is the store call the tests stub; its return value is the sole input `listSessions` consumes.
- **`src/modules/users/services/index.ts` / `src/modules/users/index.ts`** — `userService.findAuthenticatableById` is mocked to supply `id` and optional `tokensValidAfter` (the account epoch).
- **`src/modules/access/index.ts` / `src/modules/access/service.ts`** — `rolesOf` is mocked to drive the tenant-based idle-timeout branch (`editor` vs `customer`).
- **`src/infrastructure/security/hash-token.ts`** — `hashToken` is the real implementation (not mocked) used to create the `tokenHash` fixtures so the current-marking logic under test sees the same comparison it would in production.
- **`tests/support/stub.ts`** — `asStub` provides the typed-mock extraction pattern used throughout the file.

## Notes

- `row()` mints a new `Types.ObjectId` per call, so "newer" in the deduplication tests is determined by ObjectId embedded timestamp—callers must pass the two rows in either order to prove position-independence.
- The partial-mock pattern (`jest.requireActual` + spread) means any *other* export from `repository`, `users`, or `access` still executes its real code if accidentally invoked; tests fail loudly rather than silently.
- `listSessions` receives the **raw** token (`'mine'`, `'rotated-away'`), not the hash; the hashing and comparison happen inside the module under test.
- The staff-idle test relies on `lastUsedAt` being ~24 h in the past relative to `Date.now()`; it is a wall-clock test and will still pass, but the margin is fixed at 24 h.
- The "no `authTime`" epoch test documents that absence of proof is treated as "not stale," not as "always valid."
