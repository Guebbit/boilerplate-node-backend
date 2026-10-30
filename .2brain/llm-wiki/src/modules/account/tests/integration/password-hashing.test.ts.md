---
source: src/modules/account/tests/integration/password-hashing.test.ts
sha256: b58c27a2c462ef741c6a6572511f97450f29ae43a5683ee8743f2aad06abf2a8
generated_at: 2026-10-29T02:58:24.281309+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/password-hashing.test.ts

## Purpose

Integration tests that pin down three security properties at the boundary between the account service and the password-hashing layer: an unknown address still triggers one argon2id verification (decoy / timing-equality), a long password is compared in full rather than truncated, and a composition rule does not reject a valid long passphrase.

## Key elements

- **`describe('login with an unknown address')`** — asserts that `accountService.login` with a nonexistent address returns failure **and** that `verifyPassword` was called exactly once against an argon2id hash (`m=19456,t=2,p=1`), confirming the decoy cost.
- **`describe('a long password')`** — creates a user whose password shares a 72-byte prefix with a second password but differs after that; asserts the correct one logs in and the lookalike does not. Guards against implicit 72-byte truncation.
- **`describe('the password shape')`** — sets `PASSPHRASE_PASSWORD` (long, all-lowercase) via `passwordChangeWithCurrent` and logs in with it, verifying that length is the sole password policy.
- **`jest.mock` block** — replaces `verifyPassword` on the `password-hash` module with a pass-through `jest.fn` wrapping the real implementation, so calls are observable without breaking the hash/verify round-trip.
- **`setupTestDb()`** — initialises the in-memory/test database before the suite runs.

## Relationships

- **`src/infrastructure/security/password-hash.ts`** — the module under observation; `verifyPassword` is the sole function mocked (as a pass-through) so its invocation count and arguments can be asserted.
- **`src/modules/account/services/index.ts`** — provides `accountService`, the system under test (`login`, `passwordChangeWithCurrent`).
- **`src/modules/users/tests/factories.ts`** — supplies the `createUser` factory and the `PASSPHRASE_PASSWORD` / `PLAIN_PASSWORD` fixtures used across the three blocks.
- **`tests/support/callers.ts`** — provides `testCallerContext`, the caller identifier passed to `passwordChangeWithCurrent`.
- **`tests/support/ports.ts`** — provides `observePort`, the helper that wraps a port function to record its calls; also the file referenced in the inline comment explaining the mocking strategy.
- **`tests/support/setup-test-db.ts`** — provides `setupTestDb`, called once at module scope to ready the test database.

## Notes

- The module is mocked with `jest.mock` + `jest.fn(actual.verifyPassword)` rather than `jest.spyOn`. The inline comment explains that `jest.spyOn` cannot redefine a namespace-import getter under the mutation run's SWC transform (see `tests/support/ports.ts`).
- The argon2id parameter regex (`m=19456,t=2,p=1`) is a deliberate assertion on the decoy hash's cost parameters, not just its algorithm.
- The 72-byte-prefix test directly targets the classic bcrypt truncation limit; the implementation under test must handle longer inputs correctly.
