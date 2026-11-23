---
source: src/modules/orders/tests/unit/factories.test.ts
source_sha256: 1585d98bae0b6ce7fe25d3292a8aa68a95264d59a983f78fd5d77e797c76932c
context_sha256: 5a5895b3f1ea7eefc6fe94b0f443088e33d163f354d7b5581c510c58403d7eb3
generated_at: 2026-11-22T06:36:04.803189+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/orders/tests/unit/factories.test.ts

## Purpose
Unit tests for `makeOrder`, the order fixture builder in `src/modules/orders/factories.ts`. They check the builder's defaults and identity handling, and the product snapshot it embeds in each order line. An order stores what was bought, not a reference to the live catalogue, so the snapshot conversion (`toSnapshot`) is the main thing under test.

## Key elements
- **Constants**: `HEX` and `PRODUCT` are fixed valid ObjectId strings. `DOG_FOOD` is the minimum snapshot override (`id`, `title`, `price`, `taxRate`).
- **`makeOrder — identity and defaults`**:
  - A bare `makeOrder()` yields ObjectId `_id` and `userId`, and `email` `'test@example.com'`.
  - A missing owner gets a freshly minted `userId`, different on each call.
  - A string `userId` is converted to a real `ObjectId`.
  - `items` defaults to `[]`.
  - The optional fields `shippingMethod`, `shippingAddress`, `billingAddress`, `notes` and `deletedAt` are absent by default.
  - A `shippingCost` of `'0.00'` is kept, not dropped.
  - An ISO `deletedAt` string becomes a `Date`.
- **`makeOrder — the embedded product snapshot`**:
  - The snapshot is keyed by an ObjectId `_id`, with no `id` property.
  - `title` and `price` are always present.
  - `quantity` sits on the line, not inside the snapshot.
  - Catalogue fields that were not supplied (`categories`, `tags`) are omitted.
  - Supplied fields such as `categories` and `requiresShipping` are preserved.
  - A snapshot's own ISO `deletedAt` becomes a `Date`.
  - One snapshot is built per line, in order.
  - A `@ts-expect-error` assignment shows that `OrderSnapshotInput` cannot declare `onHand` or `reserved`.

## Relationships
- Imports `makeOrder` and the type `OrderSnapshotInput` from `@modules/orders/factories` (`src/modules/orders/factories.ts`), the only module under test.

## Notes
- The `onHand`/`reserved` test is only a type-level check. The runtime assertion only confirms the object kept the extra key. Whether stock counters are dropped when a live product is written is left to a separate integration test, per the file's comments.
- Absence checks use `Object.hasOwn`, so "omitted" means the key does not exist, not that its value is `undefined`.
- The `userId` must be a real `ObjectId`. A string would not match inside the `$match` that `callerScope` builds, so an order would look like it belongs to someone else.
