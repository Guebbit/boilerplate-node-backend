---
source: src/modules/orders/tests/unit/factories.test.ts
sha256: 6358b7e1a3ae09509951d5095d44a6537749f32f249d9535b2e791b15355242e
generated_at: 2026-09-23T19:13:37.840558+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/unit/factories.test.ts

## Purpose

Unit tests for the `makeOrder` fixture builder. Verifies that the generated order document satisfies schema constraints (required fields, ObjectId types, array defaults) and that the embedded product snapshot is shaped correctly for downstream consumers (confirmation email, invoice rendering).

## Key elements

- **`DOG_FOOD`** — a minimal `OrderSnapshotInput` object (id, title, price, taxRate) used as the canonical snapshot override across tests.
- **`HEX` / `PRODUCT`** — hex strings for a user ObjectId and a product ObjectId, used to assert string-to-ObjectId conversion.
- **`describe('makeOrder — identity and defaults')`** — asserts: `_id`/`userId` are real `Types.ObjectId`; `userId` is unique per call; `items` defaults to `[]`; optional fields (`shippingMethod`, `shippingAddress`, `notes`, `deletedAt`) are _absent_ (not set to `null`); `shippingCost: 0` is preserved; ISO-string `deletedAt` becomes a `Date`.
- **`describe('makeOrder — the embedded product snapshot')`** — asserts: snapshot is keyed by `_id` (not `id`); `title`/`price` are always present; `quantity` lives on the line, not the snapshot; unprovided catalogue fields (`categories`, `tags`, `active`) are omitted; `onHand`/`reserved` are not part of `OrderSnapshotInput` (proven via `@ts-expect-error`); provided catalogue fields are frozen into the snapshot; snapshot `deletedAt` converts ISO → `Date`; multiple lines produce snapshots in order.

## Relationships

- **`src/modules/orders/factories.ts`** — the sole production import. Tests exercise `makeOrder` (the factory function) and reference the `OrderSnapshotInput` type to verify its shape excludes live-stock counters.

## Notes

- The `_id` vs `id` distinction on snapshots is load-bearing: `applyProductTransform` renames `_id` on serialization, so a snapshot that accidentally carries `id` would serialize as a product with no id and break invoice linking.
- The `@ts-expect-error` test is the _type-level_ half of the stock-counter exclusion guarantee; the write-time half (that a live-stock field on the actual product document is still stripped) is covered in `orders/tests/integration/schema-contract.test.ts`.
- The `items` default is `[]`, not absent — an `undefined` array triggers a different code path in every order consumer (totals, etc.).
- `userId` uniqueness per call is intentional: a shared constant would let two "different" users see each other's orders through the `callerScope` `$match` aggregation.
