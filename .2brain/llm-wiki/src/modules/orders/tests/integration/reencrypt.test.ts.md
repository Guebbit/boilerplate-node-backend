---
source: src/modules/orders/tests/integration/reencrypt.test.ts
sha256: 54c88b64741ce40708d7c00c34baf10d7dd9601bd579d9342dc0f976a3f7465a
generated_at: 2026-11-08T07:08:16.648353+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/integration/reencrypt.test.ts

## Purpose

Integration test for the order PII key-rotation "reencrypt" walk. It verifies that, after the `NODE_PII_ENCRYPTION_KEY` is rotated from `v1` to `v2`, all frozen PII fields on an order (shipping address, customer notes) and on the order-event timeline (staff notes) are re-encrypted to `v2` while remaining fully deserializable through the normal read path.

## Key elements

- **`ROTATED_PII_KEY`** — Constant holding a two-entry key manifest (`v2:new-material,v1:test-material`) that simulates a deployment mid-rotation: the new `v2` key is active, old data still carries a `v1` stamp.
- **Test: "moves addresses and notes to v2 and the order still serializes"** — Seeds an order with a 5-field `shippingAddress` and a `notes` string, calls `ordersModule.reencrypt(false)` under the rotated key, asserts `report.rewritten === 6`, reads the raw Mongoose collection to confirm `keyVersionOf(raw.notes) === 'v2'`, then reloads via `orderModel.findById` to confirm the address still deserializes.
- **Test: "moves a staff note on the timeline to v2 and it still reads back"** — Adds a staff note via `orderService.addNote`, runs the same reencrypt, asserts the raw `orderEventModel` doc's `text` is stamped `v2`, then reads the timeline through `orderService.readTimeline` to confirm the plaintext round-trips.

## Relationships

- **`src/modules/orders/module.ts`** — Calls `ordersModule.reencrypt(false)`, the production code under test.
- **`src/modules/orders/model.ts`** — Uses `orderModel.collection` and `orderEventModel.collection` to read raw, un-decrypted documents and inspect the key-version stamp; also `orderModel.findById` for the serialized read-back assertion.
- **`src/modules/orders/services/index.ts`** — Imports `orderService` to add a staff note (`addNote`) and read the timeline (`readTimeline`).
- **`src/infrastructure/security/versioned-secret.ts`** — Imports `keyVersionOf` to assert the stamped version on raw encrypted strings.
- **`src/modules/orders/tests/factories.ts`** — `createOrder`, `toOrderItem` to build the order fixture.
- **`src/modules/products/tests/factories.ts`** — `createProduct` for the order line-item.
- **`src/modules/users/tests/factories.ts`** — `createUser` for the order owner.
- **`tests/support/callers.ts`** — `callerContextAs('admin', …)` and `asAdmin()` to supply auth context for service calls.
- **`tests/support/environment.ts`** — `withEnvironmentOverrides` swaps `NODE_PII_ENCRYPTION_KEY` for the duration of the reencrypt call.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` initializes the in-test database.

## Notes

- The tests deliberately read via `model.collection.findOne` (bypassing Mongoose hydration/decrypt hooks) to observe the raw key-version stamp. Asserting through the normal `findById` path would auto-decrypt and hide the version.
- The `false` argument to `reencrypt(false)` is passed through as-is; check the module's signature for its meaning (likely a dry-run or logging flag).
- The first test expects exactly **6** rewritten fields (5 address fields + 1 notes field); if the address schema changes, this number must be updated.
