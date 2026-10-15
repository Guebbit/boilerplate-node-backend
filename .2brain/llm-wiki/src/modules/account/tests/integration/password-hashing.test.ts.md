---
source: src/modules/account/tests/integration/password-hashing.test.ts
sha256: 73d1a25d81c517448b2fbdf252dce43ee44d0e962f6f67ebb95fb647d4492ed2
generated_at: 2026-10-15T10:12:20.744090+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/password-hashing.test.ts

## Purpose

Integration tests that lock in three password-hashing invariants at the account boundary: an unknown address still pays for one argon2id verification (decoy timing), a long password is compared in full rather than truncated at 72 bytes, and the password policy is purely length-based (all-lowercase passphrases are accepted).

## Key elements

- **`jest.mock` on `@infrastructure/security/password-hash`** — spreads the real module and replaces `verifyPassword` with a pass-through `jest.fn`. (Deliberately *not* `jest.spyOn`; see Notes.)
- **`setupTestDb()`** — initialises the in-memory test database before the suite runs.
- **`describe('login with an unknown address')`** — asserts `accountService.login` for a nonexistent email still calls `verifyPassword` exactly once against an `$argon2id$v=19$m=19456,t=2,p=1$` hash.
- **`describe('a long password')`** — creates a user whose password shares its first 72 bytes with a different string, then asserts only the exact password logs in.
- **`describe('the password shape')`** — sets a long all-lowercase passphrase via `passwordChangeWithCurrent` and logs in with it, confirming no complexity rules are enforced.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/infrastructure/security/password-hash.ts` | Module-level mock; `verifyPassword` is the function under observation. |
| `src/modules/account/services/index.ts` | `accountService` is the system under test (`login`, `passwordChangeWithCurrent`). |
| `src/modules/users/tests/factories.ts` | Supplies `createUser`, `PASSPHRASE_PASSWORD`, `PLAIN_PASSWORD` fixtures. |
| `tests/support/callers.ts` | Provides `testCallerContext` (required argument for service methods). |
| `tests/support/ports.ts` | Provides `observePort`, which wraps a port function in a jest mock and returns the spy. |
| `tests/support/setup-test-db.ts` | `setupTestDb` provisions the test database. |

## Notes

- **Why `jest.mock` instead of `jest.spyOn`:** under the mutation run's SWC transform, `jest.spyOn` cannot redefine a namespace-import getter. The `jest.mock` factory spreads `requireActual` and swaps `verifyPassword` for a `jest.fn` that delegates to the real implementation, preserving behaviour while enabling call observation.
- The decoy-hash assertion matches the full argon2id parameter prefix (`m=19456,t=2,p=1`), pinning the cost parameters used for the dummy hash.
- The 72-byte test builds its shared prefix with `'L0ng-pass!'.repeat(8)` (64 chars) plus extra, ensuring overlap well past the historical bcrypt 72-byte limit.
