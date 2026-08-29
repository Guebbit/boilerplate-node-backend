# src/modules/orders/model.ts

## Purpose

Defines the Mongoose schema, document interface, and serialization transform for order documents. It is the single source of truth for what an order persists (product snapshots, shipping snapshot, status, soft-delete flag) and how it is shaped for the API (derived totals, `_id` cleanup) before every response leaves the module.

## Key elements

- **`OrderDocumentItem`** — interface for one embedded line item: `product: ProductSnapshot` + `quantity`. Product is a snapshot (embedded, no ref) so an order records what was bought, not the current catalogue.
- **`OrderDocument`** — the Mongoose document type. Omit-lists wire-only fields (`totalItems`, `totalQuantity`, `totalPrice`, `id`) and redeclares `userId` as `ObjectId`, `status` as `OrderStatus`, `items` as `OrderDocumentItem[]`, and date fields as `Date`.
- **`OrderModel`** — `Model<OrderDocument, unknown, unknown>` alias for typed model usage.
- **`orderItemSchema`** — embedded sub-schema (`_id: false`), stores `product` (via `productSchema`, `excludeIndexes: true`) and `quantity`.
- **`orderSchema`** — top-level schema: `userId`, `email`, `items`, `status` (enum, default `pending`), `notes`, `shippingMethod`/`shippingCost` (frozen at checkout), `shippingAddress` (inline snapshot sub-schema), `deletedAt` (soft-delete), `timestamps: true`.
- **`orderSchema.index(...)` × 3** — explicit index definitions: `(userId, createdAt↓)`, `(email)`, `(userId, deletedAt)`. Names are hard-coded to match existing DB indexes.
- **`applyOrderItems`** (internal) — strips residual `_id` from items and calls `applyProductTransform` on each embedded product.
- **`applyOrderTotals`** (internal) — computes `totalItems`, `totalQuantity`, `totalPrice` via `sumLineItems` / `orderTotal`.
- **`applyOrderTransform`** — exported; wraps `applySerialization(orderSchema, …)` with an `after` hook that runs the two functions above. Used by every order response path and by aggregate results that bypass `toJSON`.
- **`orderModel`** — the registered Mongoose model (`'Order'`).

## Relationships

- **`@infrastructure/persistence/serialize`** — provides `applySerialization`, the shared base that handles `_id → id` and `__v` removal; `applyOrderTransform` layers order-specific work on top.
- **`@modules/products`** — imports `productSchema` (embedded into `orderItemSchema`), `applyProductTransform` (called per-item during serialization), and the `ProductSnapshot` type.
- **`./domain/totals`** — imports `sumLineItems`, `orderTotal`, and the `LineItem` type used by `applyOrderTotals`. The same `orderTotal` function is also called by the payment intent and confirmation email, keeping the three in agreement.
- **`@types`** — imports `OrderStatus` (enum for the schema) and `Order` (the API contract type that `OrderDocument` extends-and-overrides).
- **`./service` / `./repository` / `./factory`** — consume `orderModel`, `OrderDocument`, `OrderModel`, and `applyOrderTransform` for CRUD, queries, and test fixtures.
- **`@modules/cart/services/checkout`** — creates order documents (via the factory/service) with the shipping snapshot fields defined here.
- **`@modules/payments/service`** — reads `orderTotal` from `./domain/totals` (same source `applyOrderTotals` uses) to create payment intents.
- **`./tests/unit/serialization-guards.test.ts`** — unit-tests `applyOrderTransform` output shape.
- **`./tests/integration/model.test.ts`** — integration-tests the schema against a real Mongo instance.

## Notes

- **Product is a snapshot, never a reference.** `orderItemSchema` declares `product: productSchema` with no `ref`, so `populate()` is irrelevant and no "un-joined" state exists. Changing a product in the catalogue does not retroactively alter existing orders.
- **`excludeIndexes: true`** on the embedded `product` field prevents Mongoose from copying the catalogue's indexes onto `items.product.*` in the orders collection. Without it, every order write would maintain catalogue search indexes it never uses.
- **Totals are never stored.** `totalItems`, `totalQuantity`, `totalPrice` are derived at serialization time in `applyOrderTotals`. They are omitted from `OrderDocument` to avoid implying a stored field.
- **`shippingMethod` is optional, `shippingCost` defaults to 0.** Shipping is not required to buy; the cost is always a number. This keeps `orderTotal`'s optional-argument tolerance a guard against malformed docs, not a live contract.
- **Soft delete via `deletedAt` only.** Orders have no `active` flag. Non-admin reads exclude rows where `deletedAt` is set (`visibleScope` in the repository); admin reads pass no scope.
- **Index names are explicit.** Mongo identifies indexes by name as much as by key; using auto-derived names would collide with existing DB indexes and fail at startup.
- **`_id: false`** on `orderItemSchema` and the inline `shippingAddress` sub-schema — neither needs its own id (OpenAPI `additionalProperties: false`). Pre-existing documents may still carry a BSON `_id` on items, which `applyOrderItems` strips.
- **`totalItems` name collision** with `PaginationMeta.totalItems` is pre-existing and unrelated: here it is line-item count per order, there it is the order count in a paginated list.
