---
source: src/modules/account/tests/integration/reencrypt.test.ts
sha256: 65a6f6eee091d256b29d39cf65667592b96db8eb04f882713a63ab499388d2d0
generated_at: 2026-10-29T02:59:15.400354+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/reencrypt.test.ts

## Purpose

Integration test for the account module's `reencrypt` walk. Verifies that after a TOTP encryption-key rotation, an enrolled 2FA secret originally stamped `v1` is rewritten to `v2` in the database and remains decryptable under the same method id.

## Key elements

- **`ROTATED_TOTP_KEY`** — A composite `NODE_TOTP_ENCRYPTION_KEY` value (`v2:…,v1:…`) that simulates a deployment mid-rotation: the new key is active, the old key is still available for legacy decryption.
- **`describe('account reencrypt')` / `it('moves an enrolled secret to v2…')`** — The single test case. It:
  1. Creates a user with one TOTP two-factor method whose `secret` is encrypted under the bare `v1` key.
  2. Runs `accountModule.reencrypt(false)` inside `withEnvironmentOverrides` that exposes the rotated key.
  3. Asserts `report.rewritten === 1`, that the stored ciphertext now carries a `v2` stamp, and that `decryptTotpSecret` with the method id returns the original TOTP string.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/modules/account/module.ts` | Calls `accountModule.reencrypt(false)` to execute the migration walk under test. |
| `src/modules/account/two-factor/totp.ts` | Uses `encryptTotpSecret` (fixture setup) and `decryptTotpSecret` (post-migration verification). |
| `src/infrastructure/security/versioned-secret.ts` | Uses `keyVersionOf` to read the version stamp directly off the stored ciphertext. |
| `src/modules/users/repository.ts` | Uses `userRepository.findByIdWithCredentials` to read the rewritten document back from the DB. |
| `src/modules/users/tests/factories.ts` | Uses `createUser` to seed a user with a pre-encrypted TOTP method. |
| `tests/support/environment.ts` | Wraps the reencrypt call in `withEnvironmentOverrides` so the rotated key is visible only during the test. |
| `tests/support/setup-test-db.ts` | `setupTestDb()` initialises the in-memory MongoDB used by all integration tests in this suite. |

## Notes

- The stored `secret` field **is** the ciphertext; the version stamp is a prefix on the value itself (hence `keyVersionOf` can be called on the raw string with no separate metadata lookup).
- The encryption binding key is the stringified Mongoose `ObjectId` of the two-factor method, so the test must use a real `Types.ObjectId` (not a string literal) to mirror production.
- `reencrypt(false)` — the single boolean argument controls the walk's mode (presumably skip vs. execute); the test passes `false` to actually perform rewrites and check `report.rewritten`.
