---
source: src/modules/orders/tests/integration/reencrypt.test.ts
sha256: b9308b051cb0b98d33e2ed1543f575cb8304295e6f931512502a7c273d943f35
generated_at: 2026-10-15T11:16:14.029326+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/integration/reencrypt.test.ts

## Purpose

Integration test that verifies the orders `reencrypt` walk correctly migrates PII fields (shipping address and notes) from key version `v1` to `v2` during a simulated key rotation, and that the order still deserialises and serialises after the rewrite. It reads raw documents from the collection to confirm the version stamp was actually updated on disk, not just in the application layer.

## Key elements

- **`ROTATED_PII_KEY`** – Constant holding a two-entry manifest (`v2:new-pii-key-material,v1:test-pii-encryption-key`) that simulates a deployment mid-rotation: the new key is primary, the old key remains for decrypting legacy records.
- **`describe('orders reencrypt')`** – Single test suite; one case covers the happy path of a full reencrypt cycle.
- **`ordersModule.reencrypt(false)`** – The method under test; the `false` argument (presumably a dry-run flag) indicates a real write. Returns a `report` object whose `rewritten` count is asserted to be `6` (the PII-bearing fields across the order).
- **`versionOf(raw?.notes)`** – Reads the raw MongoDB document (bypassing the model's `decrypt` hook) and extracts the version prefix to confirm the stored ciphertext is now `v2`.
- **`orderModel.findById(...).exec()`** – Full round-trip: decrypt → parse → `toJSON()` to prove the order still serialises after rotation.

## Relationships

- **`src/modules/orders/module.ts`** – Provides `ordersModule.reencrypt()`, the code under test.
- **`src/modules/orders/model.ts`** – Provides `orderModel` (Mongoose model) used to read raw documents and reload the order through the normal decrypt pipeline.
- **`src/infrastructure/security/versioned-secret.ts`** – Provides `versionOf()`, which extracts the version tag from a versioned ciphertext string.
- **`src/modules/orders/tests/factories.ts`** – Supplies `createOrder` and `toOrderItem` for building a realistic order with PII fields.
- **`src/modules/users/tests/factories.ts`** – Supplies `createUser` to satisfy the order's owner reference.
- **`src/modules/products/tests/factories.ts`** – Supplies `createProduct` for the order line item.
- **`tests/support/setup-test-db.ts`** – Initialises the in-memory / temporary MongoDB instance used by the test.
- **`tests/support/environment.ts`** – Provides `withEnvironment`, which temporarily overrides `NODE_PII_ENCRYPTION_KEY` for the duration of the async callback.

## Notes

- The test deliberately reads the raw document (`orderModel.collection.findOne`) *before* the normal `findById` call so the assertion checks the on-disk ciphertext version, not the decrypted value.
- The `rewritten: 6` assertion is coupled to the exact number of PII fields the order schema exposes (5 address sub-fields + 1 notes field). Adding or removing a PII-bearing field on the order will break this expectation.
- `setupTestDb()` is called at module top level (outside the `describe` block), so it runs once when the file is imported by the test runner.
- The key manifest format (`v2:…,v1:…`) encodes both the active key and the legacy key in a single environment variable; the ordering implies `v2` is primary for new writes and `v1` is retained for reading pre-rotation data.
