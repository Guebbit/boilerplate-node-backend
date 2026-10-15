---
source: src/modules/addresses/tests/integration/reencrypt.test.ts
sha256: 8388b13dc14a14c58cdab58a1d09e4e89c89f929c8ab238602a89bba1af98e1a
generated_at: 2026-10-15T10:19:32.600300+00:00
model: ollama:qwen3.8:27b
---

# src/modules/addresses/tests/integration/reencrypt.test.ts

## Purpose

Integration test for the `reencrypt` walk that migrates PII-stamped address-book entries from an old key version (`v1`) to a new one (`v2`) after a key rotation. Verifies three guarantees: a dry run reports findings without writing, a real run rewrites every versioned field, and a second run is a no-op.

## Key elements

- **`ROTATED_PII_KEY`** — Composite key string (`v2:…,v1:test-pii-encryption-key`) that simulates a deployment mid-rotation, exposing both the new and old key to the worker.
- **`ADDRESS`** — Fixture object (fullName, street, city, zip, country) used as the single address written before re-encryption.
- **`describe('addresses reencrypt')` → single `it`** — Runs the full sequence inside `withEnvironment('NODE_PII_ENCRYPTION_KEY', ROTATED_PII_KEY, …)`:
  1. `reencrypt(true)` (dry run) → `rewritten: 0`, `found` reports one `v1` item under `addressbooks.items.city`.
  2. `reencrypt(false)` (real run) → `rewritten: 5` (all five PII fields), stored version bumps to `v2`.
  3. Second `reencrypt(false)` → `rewritten: 0`, stored doc unchanged.
  4. `addressesGet` confirms the address still decrypts correctly under the new key alone.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/modules/addresses/module.ts` | Calls `addressesModule.reencrypt(dryRun)` — the operation under test. |
| `src/modules/addresses/service.ts` | Uses `addressAdd` to seed data and `addressesGet` to verify post-rotation reads. |
| `src/modules/addresses/model.ts` | Reads raw via `addressBookModel.collection.findOne` to inspect the stamped version string *below* the repository's decrypt layer. |
| `src/infrastructure/security/versioned-secret.ts` | Imports `versionOf` to assert which key-version prefix a stored secret carries. |
| `src/modules/users/tests/factories.ts` | Imports `createUser` to obtain a valid user ID for the address record. |
| `tests/support/environment.ts` | `withEnvironment` scopes the `NODE_PII_ENCRYPTION_KEY` override to the test block. |
| `tests/support/setup-test-db.ts` | `setupTestDb()` initialises the in-memory/test database before the suite runs. |

## Notes

- The test deliberately reads the collection directly (`addressBookModel.collection.findOne`) rather than going through the repository, so it can observe the raw version-stamped string without decryption. This is the "below the repository's own decrypt" pattern called out in the module doc comment.
- `rewritten` is **5** (one per PII field in `ADDRESS`), not 1 — the walk touches every versioned field in the item, not just the `city` field surfaced in the `found` report.
- The dry-run `found` key is the dot-path `addressbooks.items.city`, not a generic count; the report is per-field-path.
- `setupTestDb()` is invoked at module scope (outside `describe`), so it runs once before any test in the file executes.
