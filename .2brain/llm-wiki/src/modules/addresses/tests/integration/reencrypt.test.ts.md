---
source: src/modules/addresses/tests/integration/reencrypt.test.ts
sha256: 5768bcb878ab91909d440501891422b1d37b009afeb4e9b59d65940bac66f305
generated_at: 2026-11-08T04:57:57.234581+00:00
model: ollama:qwen3.8:27b
---

# src/modules/addresses/tests/integration/reencrypt.test.ts

## Purpose

Integration test for the addresses module's `reencrypt` walk. Simulates a PII key rotation (v1 → v2) and verifies three guarantees in a single flow: dry-run writes nothing, the real run re-encrypts all stamped fields to v2, and a second run is a no-op (idempotent). Also confirms the address still reads back correctly under the new key.

## Key elements

- **`ROTATED_PII_KEY`** — a composite key string (`v2:…, v1:test-pii-encryption-key`) that mimics a deployment mid-rotation; the new v2 key leads, the old v1 key trails.
- **`ADDRESS`** — fixture object with 5 PII fields (fullName, street, city, zip, country) used to create a single address entry.
- **`describe('addresses reencrypt')`** — the suite; contains one test exercising dry-run → real-run → idempotent-rerun → read-back.
- **`setupTestDb()`** — called at module load to provision a clean test database.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/infrastructure/security/versioned-secret.ts` | Imports `keyVersionOf` to assert the version stamp on raw stored values (bypasses the service's decrypt layer). |
| `src/modules/addresses/model.ts` | Imports `addressBookModel` to read `collection.findOne` directly and inspect the stored ciphertext's version prefix. |
| `src/modules/addresses/module.ts` | Imports `addressesModule` and calls `reencrypt(dryRun: boolean)` — the unit under test. |
| `src/modules/addresses/service.ts` | Imports `addressService` to create the fixture address and to verify `list()` still returns the plaintext after rotation. |
| `src/modules/users/tests/factories.ts` | Imports `createUser` to seed a user record the address belongs to. |
| `tests/support/environment.ts` | Imports `withEnvironmentOverrides` to inject `NODE_PII_ENCRYPTION_KEY = ROTATED_PII_KEY` for the duration of the test. |
| `tests/support/setup-test-db.ts` | Imports `setupTestDb` to initialise the in-memory/test database before the suite runs. |

## Notes

- The test reads back via `addressBookModel.collection.findOne` (raw Mongoose) specifically to see the version-stamped ciphertext *before* the repository's own decrypt step — `keyVersionOf` then extracts the `v1`/`v2` prefix.
- `rewritten` is asserted to be **5**, matching the five PII fields in the `ADDRESS` fixture; each field is individually re-encrypted.
- The dry-run assertion (`rewritten === 0`, `found` reports the v1 count) happens *before* the real run, proving the dry flag suppresses all writes.
- The composite key string relies on the runtime picking the **leading** key for new writes while still accepting the trailing key for reads of v1 data — the test validates that contract end-to-end.
