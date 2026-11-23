---
source: src/modules/addresses/tests/integration/reencrypt.test.ts
source_sha256: 82a4298f3f09661cbb00b3c543269145526079ed4dedde795843036ee4135a8f
context_sha256: a01dc81e4b4cf5fcb22026f6a2c866d2f58bacad37dd9e2060c50fcc12c53d9c
generated_at: 2026-11-22T04:17:04.838184+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/addresses/tests/integration/reencrypt.test.ts

## Purpose
Integration test for the addresses module's `reencrypt` walk. It checks that after a PII key rotation, address-book entries stamped `v1` are rewritten to `v2`, that a second run is a no-op, and that a dry run writes nothing. It reads documents raw from the collection, below the repository's own decrypt, so the stamped key version is visible.

## Key elements
- `setupTestDb()`: called at module level to provision the test database.
- `ROTATED_PII_KEY`: `'v2:new-pii-key-material,v1:test-pii-encryption-key'`. It simulates a mid-rotation deployment, with a new `v2` key first and the worker's bare test key as `v1`.
- `ADDRESS`: a full address fixture (fullName, street, city, zip, country), so every encrypted field is rewritten.
- Single test, `moves v1 to v2, changes nothing on a second run, and writes nothing on a dry run`. It runs inside `withEnvironmentOverrides({ NODE_PII_ENCRYPTION_KEY: ROTATED_PII_KEY })`, in this order:
  1. **Dry run** (`reencrypt(true)`): `rewritten` is 0, `found['addressbooks.items.city']` equals `{ v1: 1 }`, and the stored city is still `v1`.
  2. **First real run** (`reencrypt(false)`): `rewritten` is 5, and the stored city is now `v2`.
  3. **Second run**: `rewritten` is 0 and the stored document is unchanged (`toEqual`).
  4. **Read-back**: `addressService.list` still returns the original address, now decryptable under the new key alone.
- `stored()`: a helper that calls `addressBookModel.collection.findOne({ userId: user._id })` to fetch the raw document.

## Relationships
- `src/modules/addresses/module.ts`: the default export (`addressesModule`) is imported and its `reencrypt` is the walk under test.
- `src/modules/addresses/service.ts`: its `addressService` is imported to seed data (`create`) and verify the read-back (`list`).
- `src/modules/addresses/model.ts`: its `addressBookModel` is imported to read the stored, encrypted documents raw through its `collection`.
- `src/infrastructure/security/versioned-secret.ts`: `keyVersionOf` reads the version stamp from a stored ciphertext.
- `src/modules/users/tests/factories.ts`: `createUser` creates the owning user.
- `tests/support/setup-test-db.ts`: supplies `setupTestDb`.
- `tests/support/environment.ts`: supplies `withEnvironmentOverrides`, which sets the rotated key for the duration of the test.

## Notes
- The count of 5 rewritten fields corresponds to the five encrypted fields of the single `ADDRESS` entry. The file states this only implicitly ("every encrypted field").
- Assertions on the stamped version check only the `city` field, not the others.
