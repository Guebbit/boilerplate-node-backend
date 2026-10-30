---
source: src/modules/addresses/tests/integration/reencrypt.test.ts
sha256: 5768bcb878ab91909d440501891422b1d37b009afeb4e9b59d65940bac66f305
generated_at: 2026-10-29T03:10:56.353472+00:00
model: ollama:qwen3.8:27b
---

# src/modules/addresses/tests/integration/reencrypt.test.ts

## Purpose

Integration test for the `reencrypt` manifest walk in the addresses module. Verifies that, after a PII key rotation, address-book entries stamped with the old key version are re-encrypted to the new version, that a second run is a no-op (idempotency), and that a dry run performs no writes.

## Key elements

- **`ROTATED_PII_KEY`** — Simulates a mid-rotation deployment: a `v2` key in front of a `v1` key, injected via `NODE_PII_ENCRYPTION_KEY`.
- **`ADDRESS`** — Fixture object (fullName, street, city, zip, country) used as test data; also serves as the expected read-back shape.
- **`it('moves v1 to v2, changes nothing on a second run, and writes nothing on a dry run')`** — Single test covering three phases in sequence:
  1. **Dry run** (`reencrypt(true)`): asserts `rewritten === 0` and that the raw field is still `v1`.
  2. **First real run** (`reencrypt(false)`): asserts `rewritten === 5` (the five address fields) and that the raw field is now `v2`.
  3. **Second real run** (`reencrypt(false)`): asserts `rewritten === 0` and that the stored document is byte-identical.
  4. **Read-back**: confirms `addressService.list` still returns the original `ADDRESS` values under the new key alone.

## Relationships

- **`src/infrastructure/security/versioned-secret.ts`** — Imports `keyVersionOf` to inspect the version prefix stamped on raw ciphertext, bypassing the repository's own decrypt.
- **`src/modules/addresses/model.ts`** — Imports `addressBookModel` to query the MongoDB collection directly for raw (still-encrypted) field values.
- **`src/modules/addresses/module.ts`** — Imports `addressesModule` and calls its `.reencrypt(dryRun)` method.
- **`src/modules/addresses/service.ts`** — Imports `addressService` to create the initial address and to verify a decrypted read-back after rotation.
- **`src/modules/users/tests/factories.ts`** — Imports `createUser` to seed a test user.
- **`tests/support/environment.ts`** — Imports `withEnvironmentOverrides` to swap `NODE_PII_ENCRYPTION_KEY` for the duration of the test.
- **`tests/support/setup-test-db.ts`** — Imports `setupTestDb` to provision a clean in-memory/test database.

## Notes

- The test reads raw documents via `addressBookModel.collection.findOne` (direct Mongoose collection access) specifically to see the version stamp **on the ciphertext**, before any service-layer decryption. This is why `keyVersionOf` is needed rather than comparing plaintext.
- `rewritten` equals **5** on the first real run, corresponding to the five address fields (`fullName`, `street`, `city`, `zip`, `country`). The `found` map in the dry-run response is keyed by the full dotted path (`addressbooks.items.city`).
- `setupTestDb()` is called at module scope (outside `describe`), so it runs once per test file load.
