---
source: src/modules/orders/tests/factories.ts
sha256: 3a8fda3f00c3e39fd069ae2d38c0308c9c2b59c7664d9ae346143bd975dd88e7
generated_at: 2026-09-23T19:09:47.035261+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/factories.ts

## Purpose

Test-database wrappers around the pure order builder in `../factories.ts`. Where the parent factory builds an order payload from in-memory data (suitable for seeds that never persist a product), this file converts a real persisted `ProductDocument` into a snapshot line and adds thin CRUD helpers so order tests can create, read, and assert on documents in the test database without going through `orderService`.

## Key elements

- **`toOrderItem(product, quantity?, locale?)`** — Converts a `ProductDocument` into an `OrderLineInput`. Copies the full document (stripping `_id`, `__v`, `taxClass`), resolves `taxClass` → `taxRate` via `resolveTaxRate`, and stores the resolved rate (not the class) on the frozen line.
- **`makeOrder(user, items, extras?)`** — Builds a valid `OrderFixture` payload from a `UserDocument` and a list of `OrderLineInput` rows by delegating to the parent `buildOrder`. `extras` (shipping, totals, etc.) pass through rather than defaulting.
- **`orderRepository`** (re-export) — The live repository singleton, exposed so a test can `jest.spyOn` it and intercept calls made _inside_ this module (e.g. compensation in `retractOrder`).
- **`createOrder(user, items, extras?)`** — Persists the fixture via `orderRepository.create` and returns the hydrated `OrderDocument`.
- **`readOrder(id)`** / **`findOrder(where)`** / **`countOrders(where?)`** — Narrow read helpers for a test's own persisted-state assertions (bypass the service layer).
- **`saveOrder(document)`** — Persists a document a test already built/mutated in memory.
- **`forceOrderStatus(orderId, status)`** — Sets an order's status directly in the DB, bypassing all lifecycle rules. Intended only for proving downstream callers handle an unreachable state (e.g. a payment attempt against a non-`pending` order). Not a production path.
- **`detachOrderUserId(userId, anonymizeAfter)`** — Detaches an account with an explicit `anonymizeAfter` date, allowing sweep tests to backdate the PII retention deadline instead of computing it from `now`.

## Relationships

- **`src/modules/orders/factories.ts`** — Imports `buildOrder`, `OrderFixture`, `OrderLineInput`, `OrderOverrides`. This file is a thin DB-touching wrapper over that pure builder.
- **`src/modules/orders/repository.ts`** — Re-exports `orderRepository` and calls its `create`, `findById`, `findOne`, `count`, `save`, `updateStatusIfIn`, and `detachUserId` methods.
- **`src/modules/orders/model.ts`** — Imports `OrderDocument` type for return types.
- **`@modules/products`** — Imports `resolveTaxRate` and `ProductDocument` for the snapshot conversion in `toOrderItem`.
- **`@modules/users`** — Imports `UserDocument` type for the user parameter.
- **`@types`** — Imports `OrderStatus` enum (used by `forceOrderStatus` to pass all valid statuses to `updateStatusIfIn`).
- **Consumer tests** (e.g. `tests/integration/cancel.test.ts`, `tests/integration/invoice-*.test.ts`, `tests/contract/api.contract.test.ts`, and sibling module tests like `cart/tests/integration/stock.test.ts`, `delivery/tests/integration/service.test.ts`) — Import these helpers to seed and assert on order state directly in the test database.

## Notes

- **Snapshot, not reference.** An order line embeds a full product snapshot (with the _resolved_ `taxRate`, not the source `taxClass`). This is intentional: repricing a product later must not rewrite what a customer was charged.
- **`toObject()` over field-by-field copying.** The destructuring spread (`{ _id, __v, taxClass, ...snapshot }`) ensures a newly added product column is carried into the snapshot automatically, avoiding the class of bug where individual field naming would silently drop it.
- **`forceOrderStatus` is test-only.** `orderService` exposes no unconditional status writer; the only callers that set status do so behind lifecycle guards. This helper exists solely so a test can reach a state the real API would never produce, in order to verify that _other_ callers handle it.
- **`orderRepository` re-export is for `jest.spyOn` binding.** A wrapper function would copy the call but not the internal binding, so spying on the wrapper cannot intercept calls this module's own code makes (e.g. `retractOrder`'s compensation path). Use the re-export only when the assertion is "was this repo method called/failed"; for DB-state assertions, prefer the named helpers.
