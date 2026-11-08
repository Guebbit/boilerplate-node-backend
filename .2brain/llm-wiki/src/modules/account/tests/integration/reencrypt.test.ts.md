---
source: src/modules/account/tests/integration/reencrypt.test.ts
sha256: 65a6f6eee091d256b29d39cf65667592b96db8eb04f882713a63ab499388d2d0
generated_at: 2026-11-08T04:40:50.295451+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/reencrypt.test.ts

## Purpose

Integration test for the account module's `reencrypt` walk: it verifies that after a TOTP encryption-key rotation, a stored secret stamped `v1` is re-encrypted to `v2` while remaining decryptable under the same method ID. Because the stored value *is* the ciphertext, the stamped version is read directly off the document.

## Key elements

- **`ROTATED_TOTP_KEY`** — Constant simulating a mid-rotation deployment: a `v2` key in front, the legacy `v1` test key behind, comma-separated in the `NODE_TOTP_ENCRYPTION_KEY` format.
- **`describe('account reencrypt')`** — Single test case that:
  1. Creates a user with one TOTP `twoFactorMethod` whose secret is encrypted under the old `v1` key.
  2. Runs `accountModule.reencrypt(false)` under the rotated-key environment.
  3. Asserts `report.rewritten === 1`, that `keyVersionOf` now reads `'v2'`, and that `decryptTotpSecret` still yields the original 16-char TOTP secret.

## Relationships

- **`src/infrastructure/security/versioned-secret.ts`** — `keyVersionOf` is used to assert the new version stamp on the stored ciphertext.
- **`src/modules/account/module.ts`** — The `accountModule.reencrypt(false)` call under test; the test validates its re-encryption behavior.
- **`src/modules/account/two-factor/totp.ts`** — `encryptTotpSecret` builds the initial v1 ciphertext; `decryptTotpSecret` verifies the re-encrypted v2 value still round-trips.
- **`src/modules/users/repository.ts`** — `userRepository.findByIdWithCredentials` fetches the persisted document to read the updated secret.
- **`src/modules/users/tests/factories.ts`** — `createUser` seeds the test user with a TOTP method; `userRepository` is re-exported here.
- **`tests/support/environment.ts`** — `withEnvironmentOverrides` swaps `NODE_TOTP_ENCRYPTION_KEY` to the rotated value for the duration of the `reencrypt` call.
- **`tests/support/setup-test-db.ts`** — `setupTestDb` provisions an in-memory (or temporary) MongoDB instance before the suite runs.

## Notes

- The `false` argument passed to `reencrypt` is the sole call signature in this test; refer to `module.ts` for its meaning (likely a dry-run / no-delete flag).
- The rotation key string uses the `vN:material` comma-separated convention; order matters — the first entry is the "current" key the worker encrypts with.
- The test asserts on `report.rewritten` (a numeric counter), so `reencrypt` is expected to return a structured report object rather than a void.
