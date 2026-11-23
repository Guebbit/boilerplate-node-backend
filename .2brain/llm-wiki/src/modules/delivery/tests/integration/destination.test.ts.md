---
source: src/modules/delivery/tests/integration/destination.test.ts
source_sha256: b2f0e06c1d71f76b13498020ae72dc41eccb67d279d7541fed5310e7940b5da0
context_sha256: c02b6ba824a702b3a3809358ad2670dff2935ac04c785d6001b1a04466b17b19
generated_at: 2026-11-22T05:00:44.926495+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/delivery/tests/integration/destination.test.ts

## Purpose
Integration tests (real Mongo via `setupTestDb`) for the per-shipment shipping-address copy. Each shipment stores its own encrypted copy of the order's shipping address as of the moment it was shipped. Later address corrections to the order don't change parcels already sent. The copy is exposed on the wire and in the account export, is removed when the order's address is scrubbed, and is re-encrypted on PII key rotation.

## Key elements
- `admin` — `callerContextAs('admin')`, used as the actor for every action.
- `FIRST` / `SECOND` — fixture addresses: the original address, and a redirect address (differs in street and zip).
- `twoUnitOrder()` — creates a fresh user (counter-based email via `buyers`), a product at 10.00, and a `processing` order of 2 units shipping to `FIRST`. Returns `{ order, productId }`.
- `shipUnits(orderId, productId, quantity)` — ships the given quantity of the order's single fulfillment order through `deliveryService.shipFulfillmentOrder`.
- Test groups:
  - **"a shipment keeps where it went"**:
    - The destination matches `FIRST` on the wire, while the raw Mongo document doesn't contain the plaintext street or phone.
    - After `orderService.correctShippingAddress`, the first parcel keeps its original street and the second gets the new one. Shipment numbers are 1 and 2.
    - Digital fulfillments and orders with no shipping address store no destination.
    - `presentExportShipment` includes the destination.
  - **"scrubbing the order scrubs the copy"**:
    - `deliveryService.scrubDestinations(orderId)` unsets the destination on that order's shipments only.
    - It returns the count changed (1, then 0 on a rerun). Another order's shipment is untouched.
  - **"rotating the PII key"**:
    - Sets `NODE_PII_ENCRYPTION_KEY` to `v2:...,v1:...` via `withEnvironmentOverrides`.
    - `deliveryModule.reencrypt(false)` rewrites 6 values on the first run and 0 on the second.
    - `keyVersionOf` reports `v2` for the stored city, and `decryptDestination` still returns `Milano`.

## Relationships
- `deliveryService` (`delivery/services`): ships and fulfills fulfillment orders, lists shipments, and scrubs destinations.
- `orderService` (`orders`): `correctShippingAddress` redirects the rest of an order.
- `shipmentModel` (`delivery/model`): reads raw stored documents to check encryption and the absence of a destination.
- `decryptDestination` (`delivery/pii`) and `presentExportShipment` (`delivery/presenter`): decrypt the stored copy and shape the export record.
- `deliveryModule` (`delivery/module`): its `reencrypt` hook is exercised for key rotation.
- `keyVersionOf` (`infrastructure/security/versioned-secret`): reads the key version prefix of ciphertext.
- Factories: `createUser`, `createProduct`, `createOrder`, `toOrderItem`, `seedDigitalOrder`, `fulfillmentOrdersOf`, `shipmentsOf`.
- Test support: `asAdmin` and `callerContextAs` from `tests/callers`, and `withEnvironmentOverrides` from `tests/environment`.
- `OrderStatus` comes from `@types`.

## Notes
- The tests rely on `NODE_PII_ENCRYPTION_KEY` already having a base key (`test-pii-encryption-key`) as `v1`. The rotation test prepends a `v2` key.
- The expected rewrite count of 6 is hard-coded for one shipment with two shipped units. It likely corresponds to the number of encrypted destination fields, but the file doesn't say so.
- The digital and pickup test expects exactly 2 stored shipments, and none of them has a `destination`.
- `shipmentModel.collection.findOne` bypasses Mongoose, so the test sees the stored form rather than the decrypted one.
