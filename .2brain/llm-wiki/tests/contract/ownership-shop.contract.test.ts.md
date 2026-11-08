---
source: tests/contract/ownership-shop.contract.test.ts
sha256: e32f1a390e1b974b5aac7b1222bea0ed43158063942ba97794d738a8060dc373
generated_at: 2026-11-08T09:20:03.710938+00:00
model: ollama:qwen3.8:27b
---

# tests/contract/ownership-shop.contract.test.ts

## Purpose

Contract test for the "shop half" of the ownership sweep. It verifies that Customer B, hitting any shop-module route (orders, payments, delivery, invoicing, returns, cart) with Customer A's ID in a path param, request body, or list filter, receives a 404 indistinguishable from a missing ID. The world is built through the modules' own factories; the attacks go exclusively over HTTP.

## Key elements

- **`SHOP_MODULES`** — `Set` of module names (`cart`, `delivery`, `invoicing`, `orders`, `payments`, `returns`) that this file is responsible for sweeping.
- **`mine(entries)`** — filters a shared `OWNED_ID` list down to entries whose module is in `SHOP_MODULES` *and* currently deployed (via `isDeployed`).
- **`paidDeliveredOrder(customer)`** — seeds a full lifecycle order: product → order → card payment → outbox settle → invoice → `delivered` → partial refund → credit note. Returns the order ID.
- **`partlyShippedOrder(customer)`** — seeds an order with two products, ships one via `deliveryService.shipFulfillmentOrder`, leaving the other unshipped.
- **`deliveredOrder(customer)`** — seeds an unpaid, delivered order (the state a return requires).
- **`seedShop()`** — orchestrates the full test world: victim (owner), attacker (Customer B), a third "shopper" customer, and collects all resource IDs (payment, refund, credit note, fulfillment order, shipment, return, address).
- **`watching(world)`** — snapshot function that re-reads A's rows *and* B's own cart/orders/returns so `judge` can assert nothing mutated.
- **`pathCase(key, victim, attacker, body?)`** — builds an `OwnedCase` whose `aim` substitutes `:param` placeholders with A's real IDs (foreign) or `MISSING_ID`. The HTTP verb is parsed from the key's first word.
- **`shopPathCases(world)`** — the concrete list of 16 path-param cases covering orders, payments, delivery, and returns routes.
- **`cartReadyToCheckOut(bearer)`** — adds a product line and `standard` shipping to a cart; returns the displayed total for later assertion.
- **`checkoutCase(world, field, ownAddressId)`** — builds an `OwnedCase` for `/cart/checkout` where a body field carries A's address ID vs. a missing one.
- **`judge`** (from `@tests/ownership-sweep`) — the test runner that executes every case, checks the 404 answer, and calls `watching` to confirm no side effects.

## Relationships

| Neighbor | Interaction |
|----------|-------------|
| `src/kernel/outbox.ts` | `settleOutboxNudges()` flushes outbox messages after payment so the invoice is emitted. |
| `src/modules/delivery/index.ts` | `deliveryService.shipFulfillmentOrder` is called to partially ship an order. |
| `src/modules/delivery/tests/factories.ts` | `carryOrderTo` advances order status; `fulfillmentOrdersOf` retrieves the fulfillment order for a given order. |
| `src/modules/invoicing/tests/factories.ts` | `waitForInvoice` polls until the invoice appears after payment. |
| `src/modules/orders/tests/factories.ts` | `createOrder` and `toOrderItem` seed orders and line items. |
| `src/modules/payments/tests/factories.ts` | `payByCard` records a successful card payment; `refundOrderPayment` issues a partial refund. |
| `src/modules/products/tests/factories.ts` | `createProduct` creates sellable products with price and stock. |
| `src/modules/users/tests/factories.ts` | `createUser` provisions the third "shopper" customer used to work around the max-open-unpaid-orders limit. |

## Notes

- **Separate file rationale:** `demo:remove` deletes every test that imports a shop module. This file *does* import shop factories, so it lives in its own file to avoid being deleted along with the general `ownership-contract.test.ts`.
- **404, not 403:** The contract is that foreign access is indistinguishable from a missing ID. A 403 would leak existence.
- **Third customer ("shopper"):** Exists because `NODE_MAX_OPEN_UNPAID_ORDERS_PER_ACCOUNT` caps how many open unpaid orders one account may hold. The shopper's checkout consumes part of the budget, so the attacker's own orders stay within the cap.
- **`isDeployed` guard:** Modules may be absent in stripped-down environments. `mine()` skips any entry whose module is not deployed, so the sweep only covers routes that actually exist in the running app.
- **Verb in the key:** `pathCase` derives the HTTP method from the first word of the key string (e.g. `"POST /orders/:id/cancel"` → `POST`). The convention is enforced by the key format, not by a separate parameter.
