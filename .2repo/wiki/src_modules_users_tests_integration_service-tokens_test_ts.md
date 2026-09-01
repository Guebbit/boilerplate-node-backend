# src/modules/users/tests/integration/service-tokens.test.ts

## Purpose

Integration tests for the two token-facing methods on the users service — `findByEmail` and `consumeToken`. It verifies that `findByEmail` returns a populated tokens array (not `undefined`) and that `consumeToken` enforces one-time-use semantics with the change persisted to the database.

## Key elements

- **`createUserWithTokens()`** – Local helper that calls the shared `createUser` fixture with two tokens (one `password`/reset, one `delete`) so filter-type and multi-token assertions have realistic data.
- **`describe('userService.findByEmail', …)`** – Three cases: happy-path lookup, tokens array is present and has length 2 (guards against the `select: false` pitfall), and unknown email resolves falsy.
- **`describe('userService.consumeToken', …)`** – Four cases: consumed token no longer appears on re-read, sibling tokens are untouched, removal is persisted (verified via a fresh DB read), and an unknown token is a safe no-op.

## Relationships

- **`src/modules/users/service.ts`** – The system under test; both `findByEmail` and `consumeToken` are called directly.
- **`src/modules/users/index.ts`** – Barrel import for `userRepository` and the `Token` type used in assertions and fixture casts.
- **`src/modules/users/repository.ts`** – `userRepository.findOneWithCredentials` is the re-read mechanism that proves persistence after `consumeToken`.
- **`src/modules/users/tests/fixtures.ts`** – Provides `createUser` used by both the local helper and the plain-lookup test.
- **`tests/support/setup-test-db.ts`** – `setupTestDb()` is called at module scope to ensure a real database is available before any test runs.

## Notes

- The module doc-comment clarifies scope: live reset/delete/verify tokens are handled by `accountService.findLiveToken` and are **not** covered here.
- `findByEmail` deliberately uses `findOneWithCredentials` (rather than the default finder) because `select: false` on `tokens` would leave the array `undefined`; callers immediately `.push` onto it, so a plain finder would throw a `TypeError` one layer away. The second test in the `findByEmail` block exists specifically to pin this contract.
- `consumeToken` assertions re-read through `userRepository.findOneWithCredentials` rather than trusting the in-memory object, ensuring the test validates a committed DB mutation, not just a local splice.
