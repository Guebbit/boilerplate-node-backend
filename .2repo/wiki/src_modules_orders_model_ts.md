# src/modules/orders/model.ts

## Purpose

Defines the Mongoose schema and model for persisted order documents, plus the serialization transform that derives wire-only totals (`totalItems`, `totalQuantity`, `totalPrice`) from embedded line items. Products and shipping addresses are stored as embedded snapshots (no `ref`) so that later catalogue or address-book edits never rewrite purchase history.

## Key elements

- **`OrderDocumentItem`** — interface for a single embedded order item: `{ product: ProductSnapshot, quantity: number }`.
- **`OrderDocument`** — Mongoose document interface; overrides `userId` (ObjectId), `status`, `items`, `deletedAt` (Date, not ISO string), and omits the three total fields that are derived, not stored.
- **`OrderModel`** — `Model<OrderDocument, …>` alias for typing the registered model.
- **`orderItemSchema`** — sub-document schema with `_id: false` and `excludeIndexes: true` on the embedded `product` field to prevent catalogue indexes from leaking onto every order's items.
- **`orderSchema`** — top-level schema: `userId`, `email`, `items`, `status` (enum, default `pending`), `notes`, `shippingMethod`, `shippingCost` (default 0, min 0), `shippingAddress` (inline sub-schema, `_id: false`), `deletedAt`, plus `timestamps: true`.
- **`applyOrderItems`** — strips residual `_id` from embedded items (pre-`_id:false` documents) and normalizes each product snapshot via `applyProductTransform`.
- **`applyOrderTotals`** — computes `totalItems`, `totalQuantity`, and `totalPrice` (via `orderTotal`) and attaches them to the serialized object.
- **`applyOrderTransform`** — composes the shared `applySerialization(orderSchema, …)` with the two above as the `after` hook. Exported so aggregate pipelines (which bypass `toJSON`) can route through the same logic.
- **`orderModel`** — the registered Mongoose model (`model('Order', orderSchema)`).

## Relationships

- **`@infrastructure/persistence/serialize.ts`** — supplies `applySerialization`, the wrapper that performs the generic `_id`→`id` / `__v` strip and then calls this file's `after` hook.
- **`./domain/totals.ts`** — provides `sumLineItems`, `orderTotal`, and the `LineItem` type used by `applyOrderTotals`.
- **`@modules/products`** — supplies `productSchema` (embedded, no ref), `applyProductTransform`, and the `ProductSnapshot` type.
- **`./repository.ts`** — consumes `orderModel` and `applyOrderTransform` for queries and result normalization.
- **`./service.ts`** — owns business logic; receives the model from the repository layer.
- **`src/modules/cart/services/checkout.ts`** — creates order documents (the source of the "frozen at checkout" snapshots).
- **`src/modules/payments/service.ts`** — calls `orderTotal` (via `./domain/totals`) for the same amount that the transform derives, keeping the payment intent and the response consistent.
- **`./tests/integration/model.test.ts`, `./tests/unit/serialization-guards.test.ts`, `./tests/unit/schema-contract.test.ts`** — verify schema shape, transform output, and contract conformance.

## Notes

- **Totals are never persisted.** They are computed at serialization time so every code path (list, get, create, update, aggregates) agrees on one formula. Declaring them on `OrderDocument` would falsely imply a stored column.
- **`excludeIndexes: true`** on `product` is load-bearing: without it Mongoose would replicate the catalogue's indexes into every order's `items.product.*`, bloating collections with indexes on frozen data.
- **`deletedAt` is the sole soft-delete mechanism.** There is no `active` boolean. The repository's `visibleScope` filters on its absence; admins omit the scope entirely.
- **`shippingCost` defaults to 0** while `shippingMethod` may be absent. This asymmetry is intentional: the cost is always a number (keeps `orderTotal`'s optional-argument check as a guard, not a contract), but the method id is only present when one was chosen.
- **Index names are explicit** (`orders_userId_createdAt`, `orders_email`, `orders_userId_deletedAt`) rather than Mongoose-derived, so that a key change with the same name fails at startup instead of silently creating a duplicate.
- **`applyOrderTransform` is exported** specifically for aggregate pipelines, which skip Mongoose's `toJSON` hook and therefore need the transform applied manually (see `create-repository`'s `normalize`).
