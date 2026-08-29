# src/modules/account/tests/integration/service.test.ts

## Purpose

Integration tests for `accountService` (the signup, login, password-change, and token-removal service). The tests are organised around security invariants rather than API surface: indistinguishable login failures, soft-delete exclusion, and password hashing. They exist because the controller suites only exercise happy paths and leave these branches at ~53 % mutation coverage.

## Key elements

- **`setupTestDb()`** — called once at module level to provision/tear down the test database.
- **`VALID_PASSWORD`** — shared constant (`'correct-horse-battery'`) used across all test groups.
- **`describe('signup')`** — asserts persistence, bcrypt hashing (regex `^\$2[aby]\$`), 422 on mismatch/validation, 409 on duplicate email, and that a missing `imageUrl` is stored as `''` (suppressing the Mongoose schema default).
- **`describe('login')`** — asserts correct-credential success, **indistinguishable** 401 for unknown account vs. wrong password (both arms compared to *each other*, not to literals), 401 for soft-deleted accounts, 422 for too-short or malformed credentials, and that the 422 shape is identical regardless of account existence.
- **`describe('validatePasswordChange')`** — pure-function tests: acceptable pair returns `[]`, mismatch / too-short / empty input all produce non-empty error arrays.
- **`describe('passwordChange')`** — verifies the new password is stored hashed, login succeeds with the new value, and a rejected pair leaves the stored password untouched (ordering: validate → assign).
- *(Truncated in source)* additional `describe` blocks for bulk token removal.

## Relationships

| Neighbor | Role in this file |
|---|---|
| `src/modules/account/services/index.ts` | System under test — provides `accountService`. |
| `src/modules/users/index.ts` | Re-exports `userRepository`, `TokenType`, `Token`, `UserDocument` used for DB assertions and type annotations. |
| `src/modules/users/repository.ts` | `userRepository.findOne` / `findOneWithCredentials` verify what was actually persisted (hashed password, image URL, soft-delete flag). |
| `src/modules/users/model.ts` | Source of the `UserDocument` shape (incl. `deletedAt`, `password`) referenced in test setup. |
| `src/modules/users/tests/factory.ts` | `createUser` seeds accounts with known credentials for login / password-change scenarios. |
| `tests/support/setup-test-db.ts` | `setupTestDb` initialises the in-memory / temp database before the suite runs. |
| `tests/support/caller-context.ts` | `testCallerContext` satisfies the caller-argument required by `signup`. |
| `tests/support/response.ts` | `asSuccess` / `asReject` unwrap the service's `Result` type so assertions can target `.data`, `.status`, `.errors`, `.message`. |

## Notes

- The "indistinguishable login failures" test deliberately compares the two rejection objects **to each other** (`toEqual` / `toBe`) instead of against fixed strings. This keeps the test green if the team later changes the message text, while still failing the instant the two code paths diverge.
- Hashing is asserted with the bcrypt modular-crypt prefix regex (`$2a$`, `$2b$`, `$2y$`), not merely "not equal to the plaintext," so a regression to MD5 or a missing `pre('save')` hook is caught.
- The `imageUrl` test exists because the Mongoose schema has a `default` (placeholder avatar). The service coalesces `undefined → ''` to suppress that default; without this test, a refactor that drops the coalescing step would silently start returning a stock image for every new user.
- Test groups are named after the **invariant** they defend (e.g. "does not reveal whether the account exists"), not after the service method, to make the security intent visible at the describe level.
