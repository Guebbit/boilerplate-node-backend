---
source: src/modules/orders/tests/factories.ts
sha256: 8922dfe2477d0c7176ec89b7aac998f81c807605fa1e719cac78457a32510534
generated_at: 2026-11-14T20:49:09.692644+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/factories.ts

## Purpose

Database-touching test factories for orders. Wraps the pure builder in `../factories.ts` with real Mongoose repository calls so integration and contract tests can seed, read, and manipulate persisted order documents. It converts live product/user documents into the embedded snapshots an order line requires, and exposes narrow assertion helpers (status forcing, timeline reads, PII-clock stamping) that bypass the service layer.

## Key elements

- **`toOrderItem(product, quantity?, locale?)`** — Converts a persisted `ProductDocument` into an `OrderLineInput`. Strips `_id`/`__v`/`taxClass`, resolves `taxClass` → `taxRate`, and sets `preorder: true` when the product is in preorder.
- **`makeOrder(user, items, extras?)`** — Delegates to the pure `buildOrder` with `userId`, `email`, `items`, and pass-through `extras` (shipping columns, status, etc.).
- **`orderRepository`** — Re-exported live repository instance; use with `jest.spyOn` to intercept internal calls (e.g. `placeOrder`'s rollback).
- **`createOrder(user, items, extras?)`** — Inserts an order via `orderRepository.create` and returns the hydrated `OrderDocument`.
- **`seedOrder(status)`** — One-line order for a fresh user + product, forced to a given status.
- **`seedDigitalOrder(status, paidAt?)`** — Same as `seedOrder` but product has `requiresShipping: false`; optionally stamps `paidAt`.
- **`readOrder(id)` / `findOrder(where)` / `countOrders(where?)`** — Direct repository assertion helpers for persisted state.
- **`forceOrderStatus(orderId, status)`** — Bypasses all lifecycle rules to set an arbitrary status (test-only door).
- **`detachOrderUserId(userId, piiClockStartedAt)`** — `$unset` userId and set PII clock on all matching orders.
- **`markOrderPaidAt(orderId, paidAt)`** — Directly stamps `paidAt` without driving the payment flow.
- **`setConformityUntil(orderId, conformityUntil)`** / **`setWithdrawUntil(orderId, withdrawUntil)`** — Freeze or clear the respective deadline fields.
- **`timelineAs(orderId, authContext)`** — Reads page 1 (size 100) via `readTimeline`, parses through `GetOrderTimeline200Response`, reverses to oldest-first.
- **`timelineOf(orderId, typePrefix?)`** — `timelineAs` as admin, optionally filtered by type prefix.
- **`lastOverrideOf(orderId)`** — Finds the last `status_overridden` timeline row.

## Relationships

- **`src/infrastructure/persistence/create-repository.ts`** — Imports `toObjectId` for converting string IDs to ObjectId in direct model updates.
- **`src/modules/delivery/tests/factories.ts`** — Sibling factory module with the same "pure builder + DB wrapper" pattern; delivery tests mirror the order-test structure.
- **`src/modules/cart/tests/integration/*`** (checkout, stock, idempotent-add, line-cap, service, product-removal, interleavings, expected-total) — Import `createOrder`, `seedOrder`, `seedDigitalOrder`, `readOrder`, `findOrder`, `countOrders`, `forceOrderStatus`, `markOrderPaidAt`, `setWithdrawUntil`, `setConformityUntil`, `timelineAs`, `timelineOf`, `lastOverrideOf` to assert order state after cart operations.
- **`src/modules/delivery/tests/integration/destination.test.ts`** and **`src/modules/delivery/tests/contract/api.contract.test.ts`** — Use the order factories to seed orders in the state a delivery flow expects.
- **`src/modules/account/tests/contract/shop.contract.test.ts`** — Reads orders via `readOrder`/`findOrder` to verify account-visible order data.
- **`src/modules/addresses/tests/integration/checkout.test.ts`** — Seeds orders with shipping extras to test address-dependent checkout.

## Notes

- `toOrderItem` copies the **whole** product document (minus `_id`/`__v`/`taxClass`) rather than naming fields individually, so a newly added column is automatically included in the snapshot.
- `taxRate` is frozen at creation time via `resolveTaxRate`; the order line never stores the original `taxClass`.
- `extras` in `makeOrder`/`createOrder` is a pass-through `Omit<OrderOverrides, 'userId'|'email'|'items'>` — omitted keys are not defaulted, so a test can distinguish "no shipping method" from "free shipping chosen."
- `forceOrderStatus` and `markOrderPaidAt` exist solely for tests that need states the real API cannot produce; they are **not** production doors — `orderService` exposes no unconditional status writer.
- `timelineAs` parses the page through the Zod contract schema (`GetOrderTimeline200Response`), so every timeline read in tests doubles as a contract-shape check.
- The re-export of `orderRepository` is specifically for `jest.spyOn` on the **live** object; a wrapper function would copy the call, not the binding, and miss internal calls like `placeOrder`'s rollback.
