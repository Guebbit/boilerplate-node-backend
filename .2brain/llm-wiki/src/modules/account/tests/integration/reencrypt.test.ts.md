---
source: src/modules/account/tests/integration/reencrypt.test.ts
sha256: 7f753d4432738e20f261f263441b12daf258d165cb69688d41d91cfd79d4f8ea
generated_at: 2026-10-15T10:12:41.534889+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/reencrypt.test.ts

## Purpose

Integration test for the account module's `reencrypt` walk: verifies that a TOTP secret still stamped `v1` is migrated to `v2` after a key rotation, and that the migrated ciphertext still decrypts correctly under its original method id.

## Key elements

- **`ROTATED_TOTP_KEY`** – A composite key string (`v2:new-totp-key-material,v1:test-totp-encryption-key`) that simulates a deployment mid-rotation (new v2 key in front, old v1 key behind).
- **Test: "moves an enrolled secret to v2…"** – Creates a user with a v1 TOTP secret, runs `accountModule.reencrypt(false)` under the rotated key, then asserts:
  - `report.rewritten === 1`
  - `versionOf(secret)` returns `'v2'`
  - `decryptTotpSecret(secret, methodId)` round-trips back to the original OTP secret.

## Relationships

- **`account/module.ts`** – Imports `accountModule` and calls `reencrypt(false)`, the function under test.
- **`two-factor/totp.ts`** – Imports `encryptTotpSecret` (to seed the v1 secret) and `decryptTotpSecret` (to verify post-migration decryption).
- **`infrastructure/security/versioned-secret.ts`** – Imports `versionOf` to assert the stamped version on the ciphertext.
- **`modules/users/repository.ts`** – Uses `userRepository.findByIdWithCredentials` to read the stored secret back from the database.
- **`modules/users/tests/factories.ts`** – Uses `createUser` to insert a user with a pre-configured TOTP method document.
- **`tests/support/environment.ts`** – Uses `withEnvironment` to temporarily set `NODE_TOTP_ENCRYPTION_KEY` to the rotated key for the duration of the assertion.
- **`tests/support/setup-test-db.ts`** – Calls `setupTestDb()` at module load to provision an isolated test database.

## Notes

- `reencrypt(false)` – the `false` argument indicates a real write (not a dry run).
- The version stamp lives *on the ciphertext itself* (read via `versionOf`), not in a separate DB field. The test relies on this to verify migration without inspecting internal state.
- Decryption is keyed by the **method id** (the `twoFactorMethods[0]._id`), not by the user id or the secret string — this is the contract the test pins down.
