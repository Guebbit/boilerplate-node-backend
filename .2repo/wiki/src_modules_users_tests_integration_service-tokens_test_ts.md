# src/modules/users/tests/integration/service-tokens.test.ts

## Purpose

Integration tests for the two token-facing service methods on `userService` — `findByEmail` and `consumeToken`. They verify that `findByEmail` returns a populated `tokens` array (not `undefined`) and that `consumeToken` permanently removes a single token while leaving the rest intact, including confirming the removal is persisted rather than just in-memory.

## Key elements

- **`createUserWithTokens()`** – Local helper that seeds a user with one `password`-type reset token and one `delete`-type delete token. Tokens are stored as `hashToken(…)` digests because the fixture writes `tokens` directly, bypassing `tokenAdd`.
- **`describe('userService.findByEmail')`** (3 cases) – Confirms lookup by email, that `found.tokens` is a 2-element array (guarding against the `select: false` undefined-push bug), and that an unknown email resolves falsy.
- **`describe('userService.consumeToken')`** (4 cases) – Asserts the consumed token is gone on re-read, sibling tokens survive, the removal is persisted (verified via a fresh `userRepository.findOneWithCredentials` call), and an unknown token is a no-op.

## Relationships

- **`src/modules/users/service.ts`** – The module under test; `findByEmail` and `consumeToken` are the two methods exercised here.
- **`src/modules/users/index.ts`** – Barrel import source for `userRepository`, `hashToken`, and the `Token` type used throughout the file.
- **`src/modules/users/repository.ts`** – `userRepository.findOneWithCredentials` is called directly in `consumeToken` tests to re-read the persisted document and prove the write actually hit the database.
- **`src/modules/users/tests/fixtures.ts`** – `createUser` provides the base user-creation path that `createUserWithTokens` builds on.
- **`tests/support/setup-test-db.ts`** – `setupTestDb()` is called at module load to provision the in-memory/test database before any test runs.

## Notes

- Tokens are always compared as hashes. The fixture stores `hashToken(…)`, not the plaintext value, because it bypasses the service-layer `tokenAdd` that would normally perform the hashing. Passing a plaintext string into the fixture would make `consumeToken`'s hashed lookup silently miss.
- `findByEmail` relies on `findOneWithCredentials` (not the standard `findOne`) specifically so that the `select: false` `tokens` field is still materialised. The tests encode this as an explicit guard: if the service ever switches back to the plain finder, the "returns the tokens array" case will fail with a `TypeError` at the caller rather than here.
- Concurrency of `consumeToken` is covered elsewhere (the "concurrency suite" referenced in the module docstring); these tests assert the *outcome* property (token no longer present) rather than racing two callers.
