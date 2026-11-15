---
source: src/modules/account/tests/integration/password-hashing.test.ts
sha256: 22ffa8584cde048d25966f2372b2e7cbf5720eaa02452e1bbe0b69a48fd181e5
generated_at: 2026-11-14T19:06:50.402614+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/password-hashing.test.ts

## Purpose

Integration tests that pin down three password-hashing guarantees in the account login/change flows: an unknown address still triggers a real argon2id verification (decoy, timing-attack mitigation), passwords longer than 72 bytes are compared in full (no silent truncation), and a long all-lowercase passphrase is a valid password (length is the sole shape constraint).

## Key elements

- **Module-level `jest.mock` of `@infrastructure/security/password-hash`** — spreads the real module and swaps only `verifyPassword` for a `jest.fn` that delegates to the real implementation. This makes the call observable without altering behavior.
- **`setupTestDb()`** — one-time database setup before all tests.
- **`describe('login with an unknown address')`** — calls `accountService.login` with a nonexistent email; asserts `verifyPassword` was called exactly once with an argon2id parameter string matching `m=19456,t=2,p=1`.
- **`describe('a long password')`** — creates a user whose password shares a 72-byte prefix with a second candidate; asserts the prefix-matching candidate fails while the real one succeeds.
- **`describe('the password shape')`** — uses `PLAIN_PASSWORD` → `PASSPHRASE_PASSWORD` (a long lowercase string) through `passwordChangeWithCurrent`, then logs in with the new passphrase; both must succeed.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/modules/account/services/index.ts` | Source of `accountService`, the system under test for both the login and password-change flows. |
| `src/infrastructure/security/password-hash.ts` | Mocked at module level; `verifyPassword` is the only member replaced (pass-through wrapper for observation). |
| `tests/support/ports.ts` | Provides `observePort`, the call-recording utility used to assert on `verifyPassword` invocations. |
| `tests/support/callers.ts` | Provides `testCallerContext`, the caller argument required by the password-change flow. |
| `src/modules/users/tests/factories.ts` | Provides `createUser` for provisioning test users and the `PLAIN_PASSWORD` / `PASSPHRASE_PASSWORD` fixtures. |
| `tests/support/setup-test-db.ts` | Provides `setupTestDb` to initialise the ephemeral database the service talks to. |

## Notes

- The mock deliberately uses `jest.requireActual` + spread rather than `jest.spyOn`. A comment in the source and `tests/support/ports.ts` explain that under the mutation-testing SWC transform, `jest.spyOn` cannot redefine a namespace-import getter, so a full module factory mock is required.
- The argon2id regex in the unknown-address test asserts the *exact* cost parameters (`m=19456,t=2,p=1`). If those parameters change in `password-hash.ts`, this test breaks — it is an intentional coupling to the security policy.
- The 72-byte prefix test is a regression guard for the classic bcrypt truncation bug; it would pass under argon2id by construction but documents the intent explicitly.
