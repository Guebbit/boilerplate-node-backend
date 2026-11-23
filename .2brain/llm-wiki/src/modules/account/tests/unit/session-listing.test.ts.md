---
source: src/modules/account/tests/unit/session-listing.test.ts
source_sha256: 3043f40a8fa02da0b76264ed6d70a311cb6a0fafff02ca884ce0fa8ece91f737
context_sha256: 3ccf95da11e5f4b2f8dcc35e422be8249b592c0adb34fc4cf8c556d72c321901
generated_at: 2026-11-22T04:08:53.217198+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/tests/unit/session-listing.test.ts

## Purpose
Unit tests for the session list published by `listSessions` and the helper `newestPerFamily` in `src/modules/account/session/listing.ts`. They check that there is one entry per sign-in (even when a rotation race left several rows), that the caller's own session is marked, and that optional fields are omitted rather than invented. The store is fully replaced with a mock. Which rows `listLive` selects is covered by the integration suite, not here.

## Key elements
- **Module mocks** (`jest.mock`): each spreads the real module and swaps one member.
  - `sessionRepository.listLive` becomes a `jest.fn()`.
  - `accountUserService.findAuthenticatableById` becomes a `jest.fn()`.
  - `accessService.rolesOf` becomes a `jest.fn()` that resolves `{ tenant: null, platform: null }`.
- `USER_ID`: the fixed account id used in every case.
- `row(familyId, overrides)`: builds a stub `SessionRow` with a fresh `_id`, `mode: 'jwt'`, a random `tokenHash` made with `hashToken`, and fixed `startedAt` and `expiresAt` dates. `_id` decides which of a family's rows is newer.
- `listLive` and `findAuthenticatableById`: typed handles to the mocks, obtained with `asStub`.
- `beforeEach`: calls `jest.resetAllMocks()`, then restores the default of no roles and an authenticatable user `{ id: USER_ID }`.

**Test groups**
- `newestPerFamily`:
  - keeps the later-written row per family, whatever its position in the input;
  - keeps every family, in the order given.
- `listSessions`:
  - publishes `id` (the family id), `createdAt`, `expiration` and `current`;
  - marks the caller's own session current, including when the caller holds the family's older row (the grace window);
  - marks nothing current when there is no credential;
  - includes `lastUsedAt` and `device` only when the row has them.
- Account epoch:
  - drops rows whose `authTime` predates the user's `tokensValidAfter`;
  - keeps rows with no `authTime`.
- Staff idle timeout:
  - hides a session with a 24h-old `lastUsedAt` when `rolesOf` returns a tenant role (`editor`);
  - keeps the same session for a user with no roles.

## Relationships
- Tests `listSessions` and `newestPerFamily` from `@modules/account/session/listing`.
- Mocks `sessionRepository` from `@modules/account/repository`, and imports the `SessionRow` type from there.
- Mocks `accountUserService` from `@modules/users/friends/account`.
- Mocks `accessService` from `@modules/access`.
- Uses `hashToken` from `@infrastructure/security/hash-token` to build row hashes. The test for the current session relies on the code under test hashing the raw token the same way.
- Uses `asStub` from `@tests/stub` for casts to the mock types.

## Notes
- The mocks spread the real module (`requireActual`), so only the named members are replaced.
- `jest.resetAllMocks()` clears the `rolesOf` default set in the mock factory, so `beforeEach` sets it again.
- The staff idle-limit test uses `Date.now()` for the stale timestamp. It does not use fake timers.
