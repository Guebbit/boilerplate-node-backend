---
source: src/modules/orders/tests/unit/factories.test.ts
sha256: cc18ac06c276b0539f3758db4b2318b01016785bbfcf96bcd7d2dc1aa8853ed7
generated_at: 2026-09-27T15:21:14.488031+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/unit/factories.test.ts

## Purpose

Unit tests for the `makeOrder` fixture builder, verifying that it produces schema-valid Order documents with correct default values, proper ObjectId instantiation, and the embedded product-snapshot semantics (`_id` keying, required `title`/`price`, exclusion of live-stock fields).

## Key elements

- **`DOG_FOOD`** — a minimal `OrderSnapshotInput` constant used as the canonical product override across snapshot tests.
- **`describe('makeOrder — identity and defaults')`** — asserts that a bare `makeOrder()` yields a valid ObjectId `_id`, a *unique* `userId` per call, a required `email`, an empty `items` array, absent optional fields, a preserved `shippingCost: 0`, and ISO-string → `Date` conversion for `deletedAt`.
- **`describe('makeOrder — the embedded product snapshot')`** — asserts that the snapshot key is `_id` (not `id`), that `title`/`price` are always present, that `quantity` lives on the line item (not inside the product), that undeclared catalogue fields are omitted, that `OrderSnapshotInput` rejects `onHand`/`reserved` at the type level, that given catalogue fields (`categories`, `active`) are frozen into the snapshot, and that multiple lines produce one snapshot each in order.

## Relationships

- **`src/modules/orders/factories.ts`** — the module under test. Imports the `makeOrder` function and the `OrderSnapshotInput` type; every assertion in this file exercises that factory's output shape and conversion logic.

## Notes

- The `@ts-expect-error` on the `onHand` assertion is intentional: it proves the type *excludes* that key. Removing the directive would make the test compile-fail, so the directive is a test itself.
- The "mints an owner" test relies on `makeOrder()` being called twice and comparing *string* representations of the ObjectIds; this is a uniqueness check, not a reference-equality check.
- Snapshot tests check `Object.hasOwn` (not `in` or truthiness) to distinguish "field absent" from "field set to `null`/`undefined`".
