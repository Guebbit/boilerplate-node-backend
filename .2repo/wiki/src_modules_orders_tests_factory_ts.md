# src/modules/orders/tests/factory.ts

## Purpose

Test-only factory for the orders module. It adapts the production order builder (`src/modules/orders/factory.ts`) to accept persisted Mongoose documents (user, product) instead of raw data snapshots, so integration and contract tests can build realistic orders without manually mapping every field.

## Key elements

- **`toOrderItem(product: ProductDocument, quantity = 1): OrderLineInput`** — Converts a persisted product document into an embedded order line by spreading `product.toObject()` (preserving `Date` types) and stripping `_id`/`__v`. The product snapshot is copied by value, not referenced.
- **`makeOrder(user: UserDocument, items: OrderLineInput[], extras?: OrderExtras): OrderFixture`** — Builds a plain order payload (no DB write) by delegating to the production `buildOrder`, injecting `userId` and `email` from the user document and passing through `extras` (shipping fields, etc.) so tests can distinguish "no method chosen" from an explicitly selected one.
- **`createOrder(user, items, extras?): Promise<OrderDocument>`** — Calls `makeOrder` then persists via `orderRepository.create`; returns the Mongoose document for assertions.
- **`OrderExtras`** (type) — `Omit<OrderOverrides, 'userId' | 'email' | 'items'>`; the set of order columns a test may override beyond identity and line items.

## Relationships

- **`src/modules/orders/factory.ts`** — Imports `makeOrder` (as `buildOrder`), `OrderFixture`, `OrderLineInput`, `OrderOverrides`. This file is a thin adapter over that builder.
- **`src/modules/orders/index.ts`** — Imports the `OrderDocument` type and `orderRepository` (used by `createOrder`).
- **`src/modules/products/index.ts`** — Imports the `ProductDocument` type for `toOrderItem`.
- **`src/modules/users`** (via `@modules/users`) — Imports the `UserDocument` type for `makeOrder`/`createOrder`.
- **Consumed by** the orders test suites (`api.contract.test.ts`, `cancel.test.ts`, `model.test.ts`, `repository.test.ts`, `service-search.test.ts`) and cross-module tests (cart, delivery, payments) that need a persisted order fixture.

## Notes

- Uses `product.toObject()` rather than `toJSON()` deliberately: `toJSON` serialises `Date` fields to ISO strings, which would corrupt the embedded subdocument's type.
- The product snapshot copy in `toOrderItem` is intentional domain behavior (price at time of purchase), not an implementation detail — do not "optimise" it into a reference.
- `extras` is spread *after* `items` in the call to `buildOrder`, so a test-supplied `items` in `extras` would overwrite the positional argument; in practice callers pass `extras` only for shipping/status columns.
- The file exists separately from the production factory because the production builder expects raw snapshots (seeds build from catalogue data that was never persisted), whereas tests hold live Mongoose documents.
