---
source: src/modules/delivery/tests/integration/destination.test.ts
sha256: ceb6dc2358b923d19f93ca4155490d731ed8b7705be59bc79bcd19568c23d282
generated_at: 2026-10-29T03:45:54.801502+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/tests/integration/destination.test.ts

## Purpose

Integration tests (against a real Mongo via `setupTestDb`) that verify the full lifecycle of a shipment's `destination` field: it is copied from the order's shipping address at the moment of the cut, stored encrypted, survives later address corrections, appears in the account export, is scrubbed when the order's address is scrubbed, and is re-encrypted on PII key rotation.

## Key elements

- **`FIRST` / `SECOND`** — two literal address fixtures (Milano, different streets/zips) used throughout.
- **`twoUnitOrder()`** — local helper that creates a `processing` order with 2 units of one product, shipping to `FIRST`; increments a buyer counter for unique emails.
- **`shipUnits(orderId, productId, quantity)`** — local helper that resolves the order's fulfillment order and calls `deliveryService.shipFulfillmentOrder` with the given quantity as admin.
- **`describe('a shipment keeps where it went')`** — four tests covering: encrypted-at-rest / readable-on-wire copy; independence from `orderService.correctShippingAddress`; no destination for digital fulfilment or zero-quantity shipments; inclusion in `presentExportShipment`.
- **`describe('scrubbing the order scrubs the copy')`** — verifies `deliveryService.scrubDestinations` unsets `destination` on only that order's shipments and is idempotent (second call returns `0`).
- **`describe('rotating the PII key')`** — uses `withEnvironmentOverrides` to set a two-version `NODE_PII_ENCRYPTION_KEY`, calls `deliveryModule.reencrypt(false)`, asserts `rewritten === 5` then `0`, and confirms the stored ciphertext is under `v2` while `decryptDestination` still yields the original city.

## Relationships

- **`src/modules/delivery/services/index.ts`** — calls `deliveryService.shipFulfillmentOrder`, `.fulfillFulfillmentOrder`, `.listShipmentsForOrder`, `.scrubDestinations`.
- **`src/modules/delivery/model.ts`** — reads raw documents via `shipmentModel.collection.findOne` / `.find` to assert encryption and `undefined` state.
- **`src/modules/delivery/pii.ts`** — calls `decryptDestination` to confirm a rotated ciphertext still decrypts correctly.
- **`src/modules/delivery/presenter.ts`** — calls `presentExportShipment` to assert the destination appears in the export shape.
- **`src/modules/delivery/module.ts`** — calls `deliveryModule.reencrypt(false)` to trigger key-rotation re-encryption.
- **`src/modules/delivery/tests/factories.ts`** — uses `fulfillmentOrdersOf` and `shipmentsOf` to query shipment/fulfillment documents.
- **`src/modules/orders/index.ts`** — calls `orderService.correctShippingAddress` for the redirect scenario.
- **`src/modules/orders/tests/factories.ts`** — `createOrder`, `seedDigitalOrder`, `toOrderItem`.
- **`src/modules/products/tests/factories.ts`** — `createProduct`.
- **`src/modules/users/tests/factories.ts`** — `createUser`.
- **`src/types/index.ts`** — `OrderStatus` enum literal.
- **`src/infrastructure/security/versioned-secret.ts`** — `keyVersionOf` to assert the ciphertext version tag.
- **`tests/support/callers.ts`** — `asAdmin`, `callerContextAs('admin')` for authenticated calls.
- **`tests/support/environment.ts`** — `withEnvironmentOverrides` to simulate key rotation.

## Notes

- Runs against a **real** MongoDB (`setupTestDb`); no service mocks.
- The rotation test asserts `rewritten === 5` — this is the total number of individual destination sub-fields across the seeded shipment documents; if the destination schema gains fields, this number will change.
- `scrubDestinations` and `reencrypt` are both expected to be **idempotent**; tests assert the second call returns `0`.
- The "ships nowhere" case passes an empty `lines: []` array to `shipFulfillmentOrder`, not `undefined`.
