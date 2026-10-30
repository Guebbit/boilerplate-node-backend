---
source: tests/contract/ownership-shop.contract.test.ts
sha256: ba94a03b0376813f3120f6642864f90d806ce55f90ee29ba5bd7c6ce6cf7dd5f
generated_at: 2026-10-29T06:39:31.797264+00:00
model: ollama:qwen3.8:27b
---

# tests/contract/ownership-shop.contract.test.ts

## Purpose

Contract test that verifies the "shop half" of the ownership boundary: when Customer B references Customer A's order, payment, refund, credit note, shipment, fulfillment order, return, or notification—whether in the URL path, the request body, or a list filter—the HTTP response is indistinguishable from a non-existent id (404). It exists as a separate file because the `demo:remove` script deletes every test that imports a shop module, and this file must not be caught by that sweep.

## Key elements

- **`SHOP_MODULES`** – Set of module names (`cart`, `delivery`, `invoicing`, `notifications`, `orders`, `payments`, `returns`) whose routes this file is responsible for sweeping.
- **`mine(entries)`** – Filters the shared `OwnedId` lists down to entries that belong to deployed shop modules.
- **`paidDeliveredOrder(customer)`** – Builds a fully-realised order (paid → invoiced → delivered → partly refunded → credit note issued) using the modules' factories and `settleOutboxNudges`.
- **`partlyShippedOrder(customer)`** – Creates a `processing` order with two products, ships one via `deliveryService.shipFulfillmentOrder`, and returns both the order and fulfillment-order ids.
- **`deliveredOrder(customer)`** – Creates a delivered-but-unpaid order, the precondition a return requires.
- **`seedShop()`** – Orchestrates the full three-customer world (victim, attacker, shopper) and returns every id the sweep needs.
- **`watching(world)`** – Returns a snapshot function that re-reads all of A's rows and B's own cart/orders/returns to assert no case caused a side-effect.
- **`pathCase(key, victim, attacker, body?)`** – Converts an `OWNED_PATH` key (e.g. `GET /orders/:id`) into an `OwnedCase` that substitutes A's id or `MISSING_ID` into the params.
- **`shopPathCases(world)`** – Emits the full list of path-based cases covering orders, payments, delivery, notifications, and returns.
- **`cartReadyToCheckOut(bearer)`** – Seeds a cart with one item and a shipping method so that body/filter cases that touch the cart have a realistic payload.
- **`judge` / `OwnedCase` / `Verb`** (from `@tests/ownership-sweep`) – The shared judging framework that actually fires each case and compares the response to `NOT_FOUND`.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/kernel/outbox.ts` | `settleOutboxNudges()` is awaited between each domain step (payment, invoice, delivery, refund) so that outbox-driven side-effects complete before the test reads the next state. |
| `src/modules/delivery/index.ts` / `src/modules/delivery/services/index.ts` | `deliveryService` is imported to call `shipFulfillmentOrder` in `partlyShippedOrder`. |
| `src/modules/delivery/services/board.ts`, `found.ts`, `release-allocated.ts` | Indirect: `carryOrderTo` and `fulfillmentOrdersOf` from the delivery test factories exercise these services internally; the test itself only sees their effects through HTTP responses. |
| `src/modules/delivery/tests/factories.ts` | `carryOrderTo` and `fulfillmentOrdersOf` are used to advance order status and fetch the created fulfillment order. |
| `src/modules/invoicing/tests/factories.ts` | `waitForInvoice` polls until the outbox-driven invoice is visible. |
| `src/modules/notifications/tests/factories.ts` | `createNotification` seeds the notification row that the sweep targets. |
| `src/modules/orders/tests/factories.ts` | `createOrder` and `toOrderItem` build the order and its line items. |
| `src/modules/payments/tests/factories.ts` | `payByCard` and `refundOrderPayment` drive the payment and refund lifecycle. |
| `src/modules/products/tests/factories.ts` | `createProduct` supplies the catalog items every scenario needs. |
| `src/modules/users/tests/factories.ts` | `createUser` creates the third "shopper" account used to absorb open-unpaid-order limits. |

## Notes

- **Why a third customer (`shopper`)?** An account is limited by `NODE_MAX_OPEN_UNPAID_ORDERS_PER_ACCOUNT`. Because the sweep's body/filter cases may create unpaid orders for B, a separate account exists so B's own quota isn't exhausted before the real cases run.
- **Attacks are HTTP-only.** Every hostile request goes through the `api()` HTTP helper with B's bearer token; no internal service function is called on B's behalf. This keeps the test a true contract (external) test.
- **Verb derivation.** `pathCase` splits the `OWNED_PATH` key on the first space to obtain the HTTP verb (`GET`, `POST`, `DELETE`). The key format is `VERB /path/:params`, so the convention is load-bearing—renaming a key breaks the test silently.
- **Shared scaffolding lives elsewhere.** The completeness check, foundation families, and shared vocabulary are in `ownership-contract.test.ts` and `@tests/ownership-sweep`; the id lists are in `@tests/owned-ids`. This file only declares *which* of those ids belong to the shop modules.
- **`isDeployed(module)` guard.** Cases are filtered at runtime, so the same file runs in environments where, e.g., `returns` is not yet enabled; the test simply has fewer cases rather than failing.
