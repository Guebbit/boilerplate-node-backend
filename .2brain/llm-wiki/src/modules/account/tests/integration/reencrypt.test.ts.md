---
source: src/modules/account/tests/integration/reencrypt.test.ts
source_sha256: 65a6f6eee091d256b29d39cf65667592b96db8eb04f882713a63ab499388d2d0
context_sha256: 345894e97753c418a35a435a2436b3bf6e633d3314d2d19f1fc21b428e764564
generated_at: 2026-11-22T03:59:20.432812+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/tests/integration/reencrypt.test.ts

## Purpose
Integration test for the account module's `reencrypt` walk. After a TOTP encryption key rotation, an enrolled two-factor secret stamped `v1` should be rewritten to `v2` and still decrypt under its method id. The stored secret is the ciphertext itself, so its key version is read directly from the document.

## Key elements
- `setupTestDb()`: called at module level to set up the test database.
- `ROTATED_TOTP_KEY`: `'v2:new-totp-key-material,v1:test-totp-encryption-key'`. It simulates a deployment mid-rotation, with a new `v2` key in front and the worker's bare (`v1`) test key behind.
- `describe('account reencrypt')` with one test, "moves an enrolled secret to v2 and it still decrypts under its method id":
  - Creates a user with one TOTP method. Its secret comes from `encryptTotpSecret('JBSWY3DPEHPK3PXP', String(methodId))`, using a fresh `Types.ObjectId` as the method id.
  - Inside `withEnvironmentOverrides({ NODE_TOTP_ENCRYPTION_KEY: ROTATED_TOTP_KEY }, ...)`, calls `accountModule.reencrypt(false)` and expects `report.rewritten` to be `1`.
  - Reloads the user with `userRepository.findByIdWithCredentials`. It asserts `keyVersionOf(secret)` is `'v2'` and that `decryptTotpSecret(secret, String(methodId))` returns the original plaintext.

## Relationships
- `src/modules/account/module.ts`: the default export `accountModule` supplies the `reencrypt` method under test.
- `src/modules/account/two-factor/totp.ts`: `encryptTotpSecret` and `decryptTotpSecret` seed the `v1` secret and verify the result after rotation.
- `src/infrastructure/security/versioned-secret.ts`: `keyVersionOf` reads the stamped version from the stored ciphertext.
- `src/modules/users/tests/factories.ts`: `createUser` builds the fixture user, and `userRepository` is re-exported for use here.
- `src/modules/users/repository.ts`: the repository behind `findByIdWithCredentials`, used to read back the stored secret.
- `tests/support/setup-test-db.ts`: `setupTestDb` provides the database lifecycle for the test.
- `tests/support/environment.ts`: `withEnvironmentOverrides` temporarily sets the rotated key env var.

## Notes
- The user and secret are created before the key override. They are therefore encrypted under the default bare `v1` test key, and only the `reencrypt` call and the assertions run under the rotated key.
- The method id is used as the encryption context (second argument) for both encrypt and decrypt, so the secret is bound to its method id.
- `reencrypt(false)` is called with a `false` argument. The file does not show what this parameter means.
