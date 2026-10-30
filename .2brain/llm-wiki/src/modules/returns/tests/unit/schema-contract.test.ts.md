---
source: src/modules/returns/tests/unit/schema-contract.test.ts
sha256: 77d8fc0d49423bd97c7560ab7f32cff580bbadadadec685a069a819f487958fe
generated_at: 2026-10-29T05:51:18.757092+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/tests/unit/schema-contract.test.ts

## Purpose

Asserts the structural contract of `returnSchema`: which fields are required, their types/enums/defaults, the index layout, and—critically—that the schema carries **no `userId`** so GDPR account erasure (Art. 17(3)(b)/(e)) never needs to touch a return record. It exists to fail loudly if anyone adds a person-linked field or breaks the order-keyed design.

## Key elements

- **`requiredPaths` check** – pins the nine mandatory fields (`currency`, `kind`, `lines`, `openedBy`, `orderId`, `orderNumber`, `reason`, `requestedAt`, `returnPostage`).
- **`userId` absence assertion** – confirms `returnSchema.path('userId')` is `undefined`, enforcing the no-person-key invariant.
- **`orderId` reference check** – verifies it is an `ObjectId` with `ref: 'Order'`.
- **Enum & default checks** – locks the closed vocabularies for `status` (6 values, default `'requested'`), `reason` (4 values), `returnPostage` (`'consumer' | 'shop'`), and `kind` (`'return' | 'cancellation'`, default `'return'`).
- **Index spec check** – asserts two compound indexes exist: `returns_orderId_createdAt` (per-order returns) and `returns_status_createdAt` (staff queue).

## Relationships

- **`src/modules/returns/model.ts`** – the sole subject under test; provides `returnSchema` (a Mongoose schema instance).
- **`tests/support/schema.ts`** – supplies the reusable assertion helpers (`enumOf`, `indexOptionSpecs`, `refOf`, `requiredPaths`, `typeOf`, `defaultOf`) that read a Mongoose schema without instantiating a model.

## Notes

- Path aliases: `@modules/…` and `@tests/…` resolve to `src/modules/…` and `tests/support/…` respectively; no relative imports are used.
- The index test joins all specs into one string and checks with `toContain`, so it tolerates additional indexes but catches missing ones.
- `kind` is deliberately two-valued (`return` vs `cancellation`) so the model can distinguish "goods coming back" from "cancel what never shipped" without a separate collection.
- The file is a pure schema-shape test; it never touches the database or validates runtime behavior.
