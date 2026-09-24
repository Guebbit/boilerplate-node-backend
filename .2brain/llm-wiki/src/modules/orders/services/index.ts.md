---
source: src/modules/orders/services/index.ts
sha256: 8382c53d2e93c417979b694fdd4296d6ec3c6cc055616bd39a770b25aa22e9a4
generated_at: 2026-09-23T19:07:03.757148+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/services/index.ts

## Purpose

Barrel file for the Order service module. It re-exports every public operation from the sub-modules (`crud`, `place`, `cancel`, `status`, `override`, `retention`, `scope`, `availability`, `invoice`, etc.) and bundles them into a single `orderService` object, giving controllers and cross-module callers one import point for all order business logic.

## Key elements

- **Named re-exports** — every function is exported individually (e.g. `placeOrder`, `cancelById`, `markPaid`, `search`, `removeById`, `renderInvoicePdf`). Callers may import any subset directly.
- **`orderService`** (const object) — aggregates the most-used operations into one object for callers that prefer a single reference.
- **Config re-exports** — `bankTransfer*` getters and `shopCurrency` are re-exported from `../config` through this file rather than the module root, because the public barrel is restricted to services/domain/events/emails/model sources.
- **Type exports** — `PlaceOrderInput`, `PlaceOrderOutcome`, `UnavailableLine` are re-exported for consumers that need them.

## Relationships

- **`src/modules/orders/controllers/*`** (`get-orders`, `get-order-item`, `delete-orders`, `get-order-invoice`, `post-cancel-order`) — controllers import the named exports or `orderService` to perform their single operation (`search`, `getById`, `remove`, `renderInvoicePdf`, `cancelById`).
- **`src/modules/cart/services/checkout.ts` / `reorder.ts`** and **`controllers/post-checkout.ts`** — cross-module callers import `placeOrder` (or `create`) to write a new order during checkout or reorder flows.
- **`src/modules/delivery/service.ts`** — imports `markShipped` / `markDelivered` to advance an order's fulfillment status.
- **`scripts/ops/reap-invoices.ts`** — calls `reapOrphanedInvoices` / `reapExpiredInvoices`.
- **`scripts/ops/reap-orders.ts`** — calls order cleanup operations (e.g. `anonymizeDueOrders`).
- **`scripts/ops/sweep-order-effects.ts`** — calls `retryPendingEffects` to reprocess stalled cancellation side-effects.
- **`src/modules/orders/config.ts`** — source of the bank-transfer and currency getters re-exported here.
- **`src/modules/cart/tests/integration/stock.test.ts`** and **`src/modules/delivery/tests/integration/service.test.ts`** — integration suites drive the named exports directly.

## Notes

- Every operation is intentionally published **both** as a named export _and_ inside `orderService`. The file's own comment warns that dropping either form would break existing callers (event wiring, cross-module barrels, and test suites each rely on one form or the other).
- Config getters are re-exported here specifically to satisfy the `local/barrel-allowed-sources` constraint; they are **not** available through the module-root barrel.
- The folder is split into sub-files (rather than one 300+ line file) per the layering rule in `docs/theory/layers.md`; this index is the single public face.
