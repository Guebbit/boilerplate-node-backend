# src/modules/orders/tests/fixtures.ts

## Purpose

Provides test fixtures that interact with the test database for the orders module. While `../fixtures.ts` offers a pure in-memory order builder (used when seeds build orders from catalogue snapshots that were never persisted), this module wraps that builder with DB-aware helpers: converting real product documents into embedded line items, assembling valid order payloads, and persisting orders via the repository.

## Key elements

- **`toOrderItem(product: ProductDocument, quantity?)`** — Converts a persisted `ProductDocument` into an `OrderLineInput`. Spreads the full document (minus `_id`/`__v`) so newly added columns aren't silently omitted; preserves `Date` types via `toObject()`. Returns `{ product: snapshot, quantity }`.
- **`makeOrder(user: UserDocument, items: OrderLineInput[], extras?)`** — Assembles an `OrderFixture` by delegating to the in-memory `buildOrder` from `../fixtures.ts`. Populates `userId` and `email` from the user; passes `extras` (shipping columns, totals, etc.) through without defaulting so callers can distinguish "unset" from "explicitly set."
- **`createOrder(user, items, extras?)`** — Calls `makeOrder` then inserts via `orderRepository.create`, returning the persisted `OrderDocument`.

## Relationships

- **`../fixtures.ts` (i.e. `src/modules/orders/fixtures.ts`)** — Imports `makeOrder` (aliased `buildOrder`), `OrderFixture`, `OrderLineInput`, and `OrderOverrides`. This file is the DB-touching layer on top of that pure builder.
- **`src/modules/orders/index.ts`** — Source of the `OrderDocument` type and `orderRepository` used for persistence.
- **`src/modules/products/index.ts`** — Source of the `ProductDocument` type consumed by `toOrderItem`.
- **`src/modules/orders/tests/contract/api.contract.test.ts`**, **`tests/integration/*.test.ts`** (cancel, model, repository, service-search) — Primary consumers; they call `createOrder` / `makeOrder` / `toOrderItem` to set up realistic DB state before exercising the module under test.
- Other modules' contract/integration tests (cart, delivery, payments) also reference this file indirectly when they need a persisted order to validate cross-module API behavior.

## Notes

- **Snapshot vs. reference:** Order items embed a full product snapshot, not a product ID. This is intentional—repricing a product later must not rewrite what a customer was originally charged. Tests that assert on prices should compare against the embedded snapshot, not the live product.
- **No defaults on `extras`:** Shipping method, total, and similar fields are passed through as-is. A test that omits a field gets `undefined`, not a sentinel default; this is how tests distinguish "customer never chose a method" from "chose a free method."
- **Whole-document copy in `toOrderItem`:** The spread (`...snapshot`) means any field added to `ProductDocument` later is automatically included in order lines. If a field needs to be excluded, strip it explicitly rather than relying on a whitelist.
- **`__v` is stripped** but `_id` is re-added as a string `id` inside the snapshot. Code reading `item.product.id` gets a string, not an ObjectId.
