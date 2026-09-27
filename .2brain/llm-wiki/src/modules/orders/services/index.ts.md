---
source: src/modules/orders/services/index.ts
sha256: eaea62a51875d231d9ed83c9561f0e378c5fc0b95322857e8dfa4af5f05db6bc
generated_at: 2026-09-27T15:14:01.674604+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/services/index.ts

## Purpose

Public barrel and service facade for the Order domain. It re-exports every operation from the `./` sub-modules (crud, place, cancel, status, override, retention, scope, availability, invoice, notify, retract, snapshot, order-numbering) and from `../config`, and bundles the primary ones into a single `orderService` object. Controllers and cross-module callers interact with the order domain **only** through this file's named exports or the `orderService` constant.

## Key elements

- **Named re-exports** — individual functions (`placeOrder`, `cancelById`, `markPaid`, `search`, `retractOrder`, `renderInvoicePdf`, `detachUserId`, `unavailableLines`, etc.) plus their type aliases (`PlaceOrderInput`, `PlaceOrderOutcome`, `UnavailableLine`).
- **`orderService` object** — a convenience bundle of ~35 of those functions exposed as one property-access surface; controllers use `orderService.getById` rather than importing the name directly.
- **Config re-exports** — `bankTransfer*`, `shopCurrency`, `shipToCountries` getters from `../config`, re-published here so callers don't import config directly (barrel-allowed-sources rule).
- **`allocateOrderNumber`** (from `./order-numbering`) and **`freezeOrderLines`** (from `./snapshot`) — exported by name but *not* included in the `orderService` object.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/modules/orders/controllers/*.ts` (create-order, get-orders, get-order-item, delete-orders, get-order-invoice) | Import `orderService` (or individual names) to perform reads, creates, deletes, invoice rendering. |
| `src/modules/cart/services/checkout.ts` / `reorder.ts` | Import `placeOrder` and `retractOrder` to commit or roll back an order during checkout. |
| `src/modules/cart/controllers/post-checkout.ts` | Calls `orderService` for post-checkout order operations. |
| `src/modules/delivery/service.ts` | Imports status transitions (`markShipped`, `markDelivered`, `markFulfilled`) to advance order lifecycle. |
| `scripts/ops/reap-invoices.ts` | Calls `reapOrphanedInvoices` / `reapExpiredInvoices`. |
| `scripts/ops/reap-orders.ts` | Drives order cleanup operations through the named exports. |
| `scripts/ops/sweep-order-effects.ts` | Calls `retryPendingEffects` to re-process stalled side-effects. |
| `src/modules/orders/config.ts` | Source of the re-exported bank-transfer and currency getters. |
| `src/modules/cart/tests/integration/stock.test.ts` / `src/modules/delivery/tests/integration/service.test.ts` | Import individual operations directly to exercise business logic in integration suites. |

## Notes

- The file is a **folder module** (`services/`) rather than a single file; the sub-files listed in the header docstring are the real implementations. This file only re-exports.
- Exports are published **both** as individual names *and* inside `orderService`. The comment explicitly warns that removing any named export would break callers (event wiring in `module.ts`, cross-module calls from `cart`, and test suites) that import by name rather than via the object.
- Config getters are re-exported here (not from `../index.ts`) because the project's `local/barrel-allowed-sources` rule restricts a module's public barrel to services/domain/events/emails/model — config must travel through the service barrel.
- `ownOrderIds` and `findOwnOrders` are re-exported from `./crud` but are **not** in the `orderService` object; callers must import them by name.
