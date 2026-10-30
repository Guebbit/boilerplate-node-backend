---
source: src/modules/orders/tests/factories.ts
sha256: 62144ed8a56b97afb245da2db9a5d0fbe8b665386d34897f0bbce188f7e5a4c8
generated_at: 2026-10-29T04:51:44.054176+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/factories.ts

## Purpose

Test-database factories for orders. This file wraps the in-memory order builder (`../factories.ts`) so that test fixtures work with **real persisted documents** (a hydrated `ProductDocument`, a `UserDocument`) rather than raw seed data. It also exposes direct repository/model mutations that let tests reach states the public API cannot produce, without driving full checkout or payment flows.

## Key elements

- **`toOrderItem(product, quantity?, locale?)`** – Converts a persisted `ProductDocument` into an `OrderLineInput` snapshot. Strips `_id`/`__v`/`taxClass`, resolves `taxRate`, and flags `preorder` based on release date — mirroring what `freezeOrderLines` would freeze at order time.
- **`makeOrder(user, items, extras?)`** – Delegates to the in-memory `buildOrder` (`../factories.ts`), passing `userId`, `email`, `items`, and any `OrderExtras` (status, shipping columns, totals, etc.).
- **`orderRepository`** (re-export) – The live repository instance, intended for `jest.spyOn` in sibling test files. Not meant for direct data access.
- **`createOrder(user, items, extras?)`** – Persists an order via `orderRepository.create` and returns the Mongoose document.
- **`seedOrder(status)`** – Convenience: fresh user + product, single line, forced to `status`.
- **`seedDigitalOrder(status, paidAt?)`** – Same as `seedOrder` but the product has `requiresShipping: false`; optionally stamps `paidAt` immediately.
- **`readOrder(id)` / `findOrder(where)` / `countOrders(where?)`** – Thin raw-query assertions on persisted state.
- **`forceOrderStatus(orderId, status)`** – Sets any status unconditionally (bypasses lifecycle guards) for tests that need to prove a *different* caller handles an illegal state.
- **`detachOrderUserId(userId, piiClockStartedAt)`** – `$unset`s `userId` on all matching orders and sets the PII-retention clock to an explicit instant.
- **`markOrderPaidAt(orderId, paidAt)`** – Stamps `paidAt` directly (internal-only field not reachable via `OrderOverrides`).
- **`setConformityUntil(orderId, date | undefined)`** – Sets or clears the frozen conformity deadline.
- **`setWithdrawUntil(orderId, date | undefined)`** – Sets or clears the frozen withdrawal deadline (the state `markDelivered` leaves behind).
- **`timelineOf(orderId, typePrefix?)`** – Reads the full admin timeline; optional prefix filter on entry type.
- **`lastOverrideOf(orderId)`** – Returns the last `status_overridden` timeline row.

## Relationships

- **`../factories.ts`** (sibling, in-memory builder) – `makeOrder` calls its `buildOrder` and re-exports its `OrderFixture`/`OrderLineInput`/`OrderOverrides` types. This file is the *persistence* layer on top of that builder.
- **`../repository`** – `createOrder`, `readOrder`, `findOrder`, `countOrders`, `forceOrderStatus` all call `orderRepository`; the raw `orderModel` is used for direct `updateMany`/`findByIdAndUpdate` paths (`detachOrderUserId`, `markOrderPaidAt`, `setConformityUntil`, `setWithdrawUntil`).
- **`src/infrastructure/persistence/create-repository.ts`** – Imports `toObjectId` for casting string IDs to ObjectId in raw model queries.
- **`@modules/products/tests/factories`** – `createProduct` is used by `seedOrder`/`seedDigitalOrder`.
- **`@modules/users/tests/factories`** – `createUser` is used by the same seed helpers.
- **`../services/timeline`** – `timelineOf` calls `readTimeline` as admin.
- **`@tests/callers`** – Provides `asAdmin` for timeline reads.
- **Consumers** – Cart integration tests (`checkout`, `stock`, `service`, `product-removal-protects-orders`, `checkout-expected-total`, `checkout-interleavings`, `checkout-stock-divergence`), delivery tests (`destination`, `lost-parcel`, `order-status-races`), the account contract test (`shop.contract.test.ts`), and the addresses checkout test all import factories from this file to seed and assert on order state in the test database.

## Notes

- **`toOrderItem` vs. `../factories.ts` builder**: The in-memory builder accepts a product *snapshot object* (useful for seeds built from catalogue rows that were never persisted). This file's `toOrderItem` accepts a real `ProductDocument` and calls `.toObject()`, so newly added columns are captured automatically — but it *requires* the document to be hydrated from the DB.
- **`forceOrderStatus` is intentionally bypass-only**: `orderService` exposes no unconditional status writer; this export exists solely so a test can place an order in a state (e.g. `cancelled`) that the API would never reach, in order to verify a *different* code path's guard.
- **`markOrderPaidAt` / `setConformityUntil` / `setWithdrawUntil`** bypass the service layer on purpose. They exist for retention/window tests where driving the full checkout → payment → delivery flow would be the only alternative.
- **`OrderExtras`** omits `userId`, `email`, and `items` from `OrderOverrides` because those are always supplied positionally; shipping-related columns pass through rather than defaulting, preserving the distinction between "no method chosen" and "chose a free one."
- **`orderRepository` re-export** is documented for `jest.spyOn` use in sibling tests; for simple assertions prefer the narrower helpers (`readOrder`, `findOrder`, `countOrders`).
