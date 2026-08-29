# src/modules/users/tests/integration/service-tokens.test.ts

## Purpose

Integration tests for the four token-facing lookups in `userService` (`findByEmail`, `findByPasswordResetToken`, `findByAccountDeleteToken`, `consumeToken`). These functions use `findOneWithCredentials` instead of the ordinary finder because the schema marks `tokens` with `select: false`; the tests pin the invariant that the returned document actually carries a populated `tokens` array and that each lookup is filtered by the correct `tokens.type`.

## Key elements

- **`createUserWithTokens`** – local helper that seeds a user with *both* a `password`-type reset token and a `delete`-type token. This dual-token fixture is what makes the `type` half of each filter observable in the assertions.
- **`describe('userService.findByEmail')`** – 3 cases: basic lookup, `tokens` array is populated (not `undefined`), and empty result for an unknown email.
- **`describe('userService.findByPasswordResetToken')`** – 4 cases: finds holder, rejects a delete token (cross-type isolation), returns token entries (so caller can read expiration), empty for unknown token.
- **`describe('userService.findByAccountDeleteToken')`** – 3 cases: finds holder, rejects a reset token, empty for unknown token.
- **`describe('userService.consumeToken')`** – 4 cases: consumed token is unusable on next lookup, sibling tokens survive, removal is persisted (not just in-memory), no-op for a token the user does not hold.

## Relationships

- **`src/modules/users/service.ts`** – the module under test; all four `describe` blocks call its exported functions.
- **`src/modules/users/index.ts`** – re-exported entry point; the test imports `userRepository` and the `Token` type from here.
- **`src/modules/users/repository.ts`** – exercised directly in the `consumeToken` persistence assertions via `userRepository.findOneWithCredentials`.
- **`src/modules/users/tests/factory.ts`** – provides `createUser`, used by both the direct factory calls and the `createUserWithTokens` helper.
- **`tests/support/setup-test-db.ts`** – provides `setupTestDb`, called once at module load to seed a clean database for the suite.

## Notes

- The file's header comment explicitly warns that swapping `findOneWithCredentials` for the ordinary finder would not fail inside these functions (they are one-liners) but would produce a `TypeError` on `undefined` one or two layers downstream in the reset/delete flows. The `tokens`-array tests are the guard against that regression.
- The dual-token fixture is load-bearing: with only one token per user, a missing `type` filter would still pass. Every lookup test therefore plants *both* types and asserts cross-rejection.
- `consumeToken` concurrency (two simultaneous uses of the same token) is covered separately under `tests/integration/concurrency/`; these tests pin the serial single-use behaviour that the race tests measure against.
