# src/modules/orders/tests/unit/fixtures.test.ts

## Purpose

Unit tests for the `makeOrder` fixture builder. They verify that the builder produces schema-valid documents with correct types (real `ObjectId` instances, not strings), that required fields are always populated, that the embedded product snapshot uses `_id` rather than `id`, and that the builder correctly distinguishes between "field omitted" and "field set to a falsy value" (e.g. `shippingCost: 0`).

## Key elements

- **`PANINO`** – a minimal `OrderSnapshotInput` object (`id`, `title`, `price`) reused across snapshot tests as the canonical "product purchased" payload.
- **`HEX` / `PRODUCT`** – raw hex strings for a user ObjectId and a product ObjectId, used to confirm the builder converts string overrides into `Types.ObjectId` instances.
- **`describe('makeOrder — identity and defaults', …)`** – asserts: no-arg call yields valid `_id`/`userId` ObjectIds and a default email; two calls produce *different* `userId` values; explicit string `userId` is stored as an ObjectId; `items` defaults to `[]` (not `undefined`); optional schema fields (`shippingMethod`, `shippingAddress`, `notes`, `deletedAt`) are absent rather than `null`; `shippingCost: 0` is preserved; ISO-string `deletedAt` becomes a `Date`.
- **`describe('makeOrder — the embedded product snapshot', …)`** – asserts: snapshot is keyed by `_id` (ObjectId) with no `id` key; `title` and `price` are always present; `quantity` lives on the line, not inside the product; unspecified catalogue fields (`categories`, `tags`, `active`, `onHand`, `reserved`) are omitted; explicitly provided catalogue fields are frozen into the snapshot; snapshot `deletedAt` ISO strings become `Date`; multiple lines each get their own snapshot in input order.

## Relationships

- **`src/modules/orders/fixtures.ts`** – the sole dependency. The test file imports `makeOrder` from this module and exercises every contract it documents in its module-level JSDoc comment.

## Notes

- Tests intentionally assert **absence** of keys (`Object.hasOwn(…, field) === false`) rather than asserting `undefined` values, because the codebase treats "key not present" and "key present but `undefined`" as different code paths in consumers.
- The `quantity`-not-inside-product assertion is a deliberate guard: the snapshot is a *product* record; quantity is an *order-line* concern. If a future refactor merges them, the invoice rendering logic would break.
- `expect(String(makeOrder().userId)).not.toBe(String(makeOrder().userId))` checks that two no-arg calls produce *different* owners, preventing a shared-constant bug that would let one user see another's orders through `callerScope` aggregation `$match`.
