# src/modules/orders/model.ts

## Purpose

Defines the Mongoose schema, document interface, and serialization transform for order documents. The central design choice is **snapshot embedding**: products and the shipping address are stored inline (no `ref`, no `populate`) so that later catalogue or address-book edits cannot rewrite purchase history. The three totals (`totalItems`, `totalQuantity`, `totalPrice`) are never persisted; they are derived at the single serialization choke-point so every response path (list, get, create, update, aggregates) computes them identically.

## Key elements

- **`OrderDocument`** (interface) – Mongoose document shape. Omits the wire-only totals from the generated `Order` type; re-types `userId` as optional (unset after account erasure), adds `anonymizeAfter`, and types dates as `Date` rather than ISO strings.
- **`OrderDocumentItem`** (interface) – Shape of each embedded item: `{ product: ProductSnapshot, quantity }`.
- **`OrderModel`** (type alias) – `Model<OrderDocument, unknown, unknown>` for use in repository/service signatures.
- **`orderItemSchema`** – Sub-schema with `_id: false` and `excludeIndexes: true` on the embedded `product` to prevent Mongoose from propagating catalogue indexes into every order's items.
- **`orderSchema`** – Top-level schema. `userId` is *not* `required` (deliberate erasure path). Declares four named indexes: `orders_userId_createdAt`, `orders_email`, `orders_userId_deletedAt`, and a **sparse** `orders_anonymizeAfter` (explicitly *not* a TTL index).
- **`applyOrderItems`** (internal) – Deletes leftover `_id` on embedded items (legacy docs) and recursively normalizes each product snapshot via `applyProductTransform`.
- **`applyOrderTotals`** (internal) – Calls `sumLineItems` + `orderTotal` from `./domain/totals` to set the three total fields on the serialized object.
- **`applyOrderTransform`** (exported) – The serialization function built on `applySerialization(orderSchema, …)`. Omit-lists `anonymizeAfter` from the wire payload; `after` hook runs `applyOrderItems` then `applyOrderTotals`. Exported so aggregate pipelines (which bypass `toJSON`) can reuse it.
- **`orderModel`** (exported) – The registered Mongoose model (`model('Order', orderSchema)`).

## Relationships

- **`./domain/totals`** – Provides `sumLineItems`, `orderTotal`, and the `LineItem` type used by `applyOrderTotals`. This is the single source of truth for pricing; the payment intent and confirmation email call the same function.
- **`@infrastructure/persistence/serialize`** – Provides `applySerialization`, the shared base that handles `_id`→`id` rename, `__v` stripping, and the omit/after pipeline.
- **`@modules/products`** – Imports `productSchema` (embedded as a sub-schema) and `applyProductTransform` (normalizing each snapshot during serialization).
- **`./repository`** – Consumes `orderModel` for all query execution; uses `applyOrderTransform` on aggregate results.
- **`./service`** – Consumes `orderModel` for CRUD; business logic lives here, not in the schema.
- **`./index`** – Barrel re-exports the public surface of this module.
- **`src/modules/cart/services/checkout.ts`** – Downstream consumer: creates order documents through the service using this schema.
- **`src/modules/payments/service.ts`** – Reads order totals; relies on the same `orderTotal` call to stay consistent with the serialized value.
- **`./fixtures`, `./demo`** – Use `orderModel` / `orderSchema` to seed and inspect data.
- **Tests** – `schema-contract.test.ts` validates the schema against the OpenAPI contract; `serialization-guards.test.ts` exercises `applyOrderTransform` edge cases; `model.test.ts`, `service-crud.test.ts`, `service-search.test.ts` exercise the model through the repository/service.

## Notes

- **Snapshot, not reference.** `product` is declared as `{ type: productSchema, excludeIndexes: true }` with no `ref`. There is nothing for `populate()` to resolve. The same pattern applies to `shippingAddress` (inline sub-schema, not a reference to an address-book document).
- **Totals are derived, never stored.** Declaring them on `OrderDocument` would falsely imply a persisted field. They exist only on the serialized output.
- **`userId` is intentionally optional.** Account erasure unsets it (Art. 17(3)(b)/(e)) while the invoice row survives. This is the one foreign key in the repo that is *meant* to dangle.
- **`anonymizeAfter` is bookkeeping for `scripts/reap-orders.ts`**, which scrubs PII fields once the date passes. The row is never deleted, so the index is sparse and carries no `expireAfterSeconds`.
- **Index names are explicit** (e.g. `orders_userId_createdAt`) to match names already present in production databases; a name mismatch would fail at startup rather than silently no-op.
- **Legacy `_id` on items.** Documents saved before `_id: false` took effect still carry a BSON-level `_id` on each item; `applyOrderItems` strips it during serialization.
- **`shippingMethod` / `shippingCost` are a pair** that are both absent only when no method was chosen. A `pickup` or free-above-threshold checkout still freezes `shippingMethod` with `shippingCost: 0`.
