---
source: src/modules/account/tests/integration/password-hashing.test.ts
source_sha256: bfef25eb6e4b371ba4078c6b74e91478fbacf9c9a7f71af5c6089161851b4020
context_sha256: a28684f915ed178a5930f1183ec52e0aa911f8be8f2cd34afb61bdb4befb57bc
generated_at: 2026-11-22T03:58:13.234936+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/tests/integration/password-hashing.test.ts

## Purpose
Integration tests covering where the password hash meets the account flows. It checks three behaviors: an unknown email still costs one argon2id verification (a decoy hash), a long password is compared in full rather than truncated, and a password with no mix of character classes is accepted (length is the whole policy).

## Key elements
- **`jest.mock('@infrastructure/security/password-hash', ...)`**: keeps the real module but replaces `verifyPassword` with a `jest.fn` that passes through to the actual implementation. It is a replacement, not a `jest.spyOn`, because spyOn cannot redefine a namespace import's getter under the mutation run's swc transform.
- **`setupTestDb()`**: sets up the test database for the file.
- **`login with an unknown address`**: calls `accountService.login` with `nobody@example.com`. It expects `success: false`, exactly one `verifyPassword` call, and a second argument (the hash) matching `$argon2id$v=19$m=19456,t=2,p=1$`.
- **`a long password`**: creates a user whose password is a 72-byte prefix (`'L0ng-pass!'.repeat(8)`) plus a "real" ending. Login with the real password succeeds. Login with the same first 72 bytes and a different ending fails.
- **`the password shape`**: creates a user with `PLAIN_PASSWORD`, then calls `accountService.passwordChangeWithCurrent` to change it to `PASSPHRASE_PASSWORD` (long, all-lowercase). It expects the change and a following login to both succeed.

## Relationships
- `@infrastructure/security/password-hash` (`src/infrastructure/security/password-hash.ts`): the module under test. Its `verifyPassword` is wrapped by the mock and the rest is used as is.
- `@modules/account/services` (`src/modules/account/services/index.ts`): provides `accountService`, whose `login` and `passwordChangeWithCurrent` are exercised.
- `@modules/users/tests/factories` (`src/modules/users/tests/factories.ts`): provides `createUser`, `PLAIN_PASSWORD` and `PASSPHRASE_PASSWORD`.
- `@tests/ports` (`tests/support/ports.ts`): provides `observePort`, which gives access to the mocked `verifyPassword`'s calls. The file's mock comment points to this module for the swc limitation.
- `@tests/callers` (`tests/support/callers.ts`): provides `testCallerContext`, passed to `passwordChangeWithCurrent`.
- `@tests/setup-test-db` (`tests/support/setup-test-db.ts`): provides `setupTestDb`.

## Notes
- The unknown-address test asserts on the hash argument (`mock.calls[0][1]`) to verify the decoy is a real argon2id hash with the stated parameters. It does not time anything.
- The long-password test's wording ("first 72 bytes") suggests a guard against bcrypt-style truncation.
