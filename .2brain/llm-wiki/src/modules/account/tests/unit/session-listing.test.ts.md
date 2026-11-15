---
source: src/modules/account/tests/unit/session-listing.test.ts
sha256: 3043f40a8fa02da0b76264ed6d70a311cb6a0fafff02ca884ce0fa8ece91f737
generated_at: 2026-11-14T19:16:58.493471+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/unit/session-listing.test.ts

## Purpose

Unit tests for the two exports of `@modules/account/session/listing` (`newestPerFamily` and `listSessions`). They verify the public shape of the session list: one entry per family regardless of rotation-race duplicates, correct `current` marking, absence (not invention) of optional fields, account-epoch (ban) filtering, and the staff idle-timeout rule. The store is fully replaced; what `listLive` returns is controlled per-case.

## Key elements

- **`row(familyId, overrides?)`** – local factory that builds a `SessionRow` fixture with a fresh `Types.ObjectId` for `_id` (so the last-created object is always "newer"), a fixed `USER_ID`, and a `hashToken`-generated `tokenHash`.
- **`describe('newestPerFamily')`** – asserts that the function keeps exactly one row per `familyId` (the later-written one, regardless of input order) and preserves the caller's family ordering.
- **`describe('listSessions')`** – asserts the mapped output (`id`, `createdAt`, `expiration`, `current`), that `lastUsedAt`/`device` are absent when the row lacks them, and that `current` is `false` when no credential is supplied.
- **`describe('listSessions and the account epoch')`** – asserts rows whose `authTime` (Unix seconds) predates the account's `tokensValidAfter` are dropped, while rows with no stored `authTime` are kept.
- **`describe('listSessions and the staff idle timeout')`** – asserts that a session whose `lastUsedAt` exceeds the idle window is hidden when the caller holds a staff role (`tenant: 'editor'`) but visible for a non-staff caller.

## Relationships

- **`src/modules/account/session/listing.ts`** – the module under test; provides `listSessions` and `newestPerFamily`.
- **`src/modules/account/repository.ts`** – the session store whose `listLive` method is mocked to return controlled `SessionRow` arrays.
- **`src/modules/users/friends/account.ts`** – the account-read service whose `findAuthenticatableById` is mocked to supply the account record (id, `tokensValidAfter`).
- **`src/modules/access/index.ts`** – the access service whose `rolesOf` is mocked to drive staff-vs-shopper role logic.
- **`src/infrastructure/security/hash-token.ts`** – `hashToken` is called in fixtures to produce realistic `tokenHash` values.
- **`tests/support/stub.ts`** – `asStub` is used to type-assert the jest mocks back into their real shapes.

## Notes

- Mocks use the `jest.mock` + `requireActual` spread pattern so only the specific method is replaced while the rest of each module's exports remain intact.
- "Newer" in `newestPerFamily` is determined by `Types.ObjectId` natural ordering (timestamp-embedded), not by an explicit `startedAt` comparison; the `row()` helper relies on creation order.
- The staff idle-timeout test uses `Date.now() - 24 h`, making it wall-clock relative rather than fixed-time.
- The `current`-marking test for the rotation race passes the *old* token (`'rotated-away'`) as the caller credential, verifying that family-level (not row-level) matching marks the entry.
- `hashToken` is imported only for fixture realism; the `listSessions` signature takes the raw token string (e.g. `'mine'`), not a hash.
