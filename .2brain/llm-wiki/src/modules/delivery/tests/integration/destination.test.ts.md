---
source: src/modules/delivery/tests/integration/destination.test.ts
sha256: 58cc118125c8aed725e91ca50cf2def1c32a7cdbaaaa383d9e8a9feb3a5e35b7
generated_at: 2026-11-08T05:41:59.078840+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/tests/integration/destination.test.ts

## Purpose

Integration tests verifying the lifetime of a shipment's destination address: it is copied from the order at ship-time, encrypted at rest, isolated from later address corrections, included in account exports, removed on order scrub, and migrated during PII key rotation. Runs against a real MongoDB instance.

## Key elements

- **`FIRST` / `SECOND`** — two fixed address fixtures; `SECOND` differs in street and zip to prove copies don't follow corrections.
- **`twoUnitOrder()`** — creates a `processing` order for 2 units shipping to `FIRST`; increments a module-level `buyers` counter to guarantee unique buyer emails.
- **`shipUnits(orderId, productId, quantity)`** — resolves the order's single fulfillment order and calls `deliveryService.shipFulfillmentOrder` for a given quantity.
- **"a shipment keeps where it went" suite** — four specs: address is copied & encrypted at cut; first parcel is unaffected by a later `correctShippingAddress`; digital/pickup orders store no destination; `presentExportShipment` surfaces the destination.
- **"scrubbing the order scrubs the copy" suite** — `deliveryService.scrubDestinations` unsets only the target order's shipments (other orders untouched); second call is a no-op (`1` then `0` affected).
- **"rotating the PII key" suite** — overrides `NODE_PII_ENCRYPTION_KEY` with a two-version string, invokes `deliveryModule.reencrypt(false)`, asserts `rewritten: 6` on first pass / `0` on re-run, and confirms `keyVersionOf` reads `v2` and `decryptDestination` still yields the plaintext city.

## Relationships

- **`deliveryService`** (services/index) — primary SUT: `shipFulfillmentOrder`, `listShipmentsForOrder`, `scrubDestinations`, `fulfillFulfillmentOrder`.
- **`orderService`** (orders/index) — `correctShippingAddress` used to verify address isolation.
- **`shipmentModel`** (model) — direct Mongo queries to assert raw encryption and absence of plaintext.
- **`deliveryModule.reencrypt`** (module) — called under the key-rotation environment override.
- **`decryptDestination`** (pii) — verifies the stored ciphertext round-trips after rotation.
- **`keyVersionOf`** (versioned-secret) — inspects the version tag embedded in the encrypted value.
- **`presentExportShipment`** (presenter) — confirms the export shape includes `destination`.
- **`fulfillmentOrdersOf`, `shipmentsOf`** (tests/factories) — test-only queries to fetch delivery documents.
- **`createUser`, `createProduct`, `createOrder`, `seedDigitalOrder`, `toOrderItem`** (users/products/orders factories) — seed the prerequisite data.
- **`asAdmin`, `callerContextAs`** (callers) — build the caller context passed to every service act.
- **`withEnvironmentOverrides`** (environment) — temporarily swaps `NODE_PII_ENCRYPTION_KEY` for the rotation spec.
- **`OrderStatus`** (types) — used when creating orders in the desired state.

## Notes

- `buyers` is a module-level mutable counter, not a `jest.fn()` — it exists solely to make buyer emails unique across parallel-ish specs within this file.
- The key-rotation spec expects `rewritten: 6`, which corresponds to the six individual fields (`fullName`, `street`, `city`, `zip`, `country`, `phone`) stored as separate encrypted values in a single destination subdocument.
- Scrub and reencrypt are both asserted idempotent (second invocation returns `0`), so any future change that makes them non-idempotent will break this test.
- The test file calls `setupTestDb()` at module scope — it assumes a real `MONGO_URI`/`setup-test-db` helper; it will not run in a pure in-memory environment.
