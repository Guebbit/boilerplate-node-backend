---
source: src/modules/account/tests/integration/password-hashing.test.ts
sha256: b58c27a2c462ef741c6a6572511f97450f29ae43a5683ee8743f2aad06abf2a8
generated_at: 2026-11-08T04:39:37.677665+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/password-hashing.test.ts

## Purpose

Integration tests that verify three password-hashing guarantees *inside* the account login/change flows: (1) an unknown address still triggers one argon2id verification (decoy, so a miss costs the same as a wrong password), (2) the full password is compared rather than a truncated 72-byte prefix, and (3) a long all-lowercase passphrase is accepted as a valid password with no composition-rule rejection.

## Key elements

- **`jest.mock('@infrastructure/security/password-hash')`** — module-level mock factory that spreads the real module and replaces only `verifyPassword` with a pass-through `jest.fn`. All other exports (e.g. `hashPassword`) remain real.
- **`setupTestDb()`** — initialises a throwaway database before the suite runs.
- **`describe('login with an unknown address')`** — asserts `verifyPassword` is called exactly once and that the second argument matches the argon2id parameter string (`$argon2id$v=19$m=19456,t=2,p=1$`).
- **`describe('a long password')`** — creates a user whose password shares its first 72 bytes with a sibling string; asserts only the exact match logs in.
- **`describe('the password shape')`** — changes a password to `PASSPHRASE_PASSWORD` (long, all-lowercase) via `passwordChangeWithCurrent`, then logs in with it to confirm no composition rule blocks it.

## Relationships

- **`src/infrastructure/security/password-hash.ts`** — the module under test. `verifyPassword` is mocked; the rest of the module stays real. The test observes calls via `observePort` from `tests/support/ports.ts`.
- **`src/modules/account/services/index.ts`** — provides `accountService` (`.login`, `.passwordChangeWithCurrent`), the system under test.
- **`src/modules/users/tests/factories.ts`** — supplies `createUser` and the password constants `PASSPHRASE_PASSWORD`, `PLAIN_PASSWORD`.
- **`tests/support/callers.ts`** — provides `testCallerContext` (auth/caller identity) passed to `passwordChangeWithCurrent`.
- **`tests/support/ports.ts`** — provides `observePort`, a helper for asserting on mocked port functions without `jest.spyOn`.
- **`tests/support/setup-test-db.ts`** — provides `setupTestDb` for the integration DB lifecycle.

## Notes

- The mock is written as a `jest.mock` factory (not `jest.spyOn`) because `jest.spyOn` cannot redefine a namespace-import getter under the project's SWC transform. `observePort` in `tests/support/ports.ts` exists for the same reason and is the idiomatic way to assert on port calls in this codebase.
- The decoy-hash assertion checks the *parameter string* of the argon2id output, not just that a hash was produced — this pins the exact cost parameters (m, t, p) used for the dummy verification.
- The "long password" test deliberately constructs a 72-byte common prefix (`'L0ng-pass!'.repeat(8)` = 72 bytes) to guard against accidental truncation in any intermediate step.
