---
source: src/modules/orders/services/index.ts
sha256: 332531671d369c48fc4b1b56c1f28573a536cf6f4dd508384c54b508007d6d94
generated_at: 2026-10-15T11:08:27.732736+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/services/index.ts

## Purpose

Barrel file for the `orders/services` folder. It re-exports every operation (read, write, status, cancel, retention, scope, fulfillment, timeline, stats) and the config getters that other modules need, and aggregates them all into a single `orderService` object. Controllers and cross-module callers interact with the Order domain exclusively through this file.

## Key elements

- **`orderService`** — exported object that bundles every function below into one namespace; the primary entry point for controllers and cross-module callers.
- **Named re-exports** — each sub-module (`read`, `crud`, `remove`, `place`, `notify`, `cancel`, `status`, `fulfillment`, `override`, `export`, `timeline`, `retention`, `scope`, `snapshot`, `reencrypt`, `stats`) is re-exported by name so event wiring, cart integration, and test suites can import individual functions without going through the object.
- **Config re-exports** (`bankTransfer*`, `shop*`, `returnAddress`, etc.) — pulled from `../config` and published here because the module's public barrel is restricted to services/domain/events/emails/model sources.
- **Type exports** — `PlaceOrderInput`, `PlaceOrderOutcome`, `OrderBrief`, `ForcedFulfilment`, `OrderExport`, `ShopIdentity`, `ReturnAddress`, stats types, etc.

## Relationships

- **`src/modules/cart/services/checkout.ts` / `reorder.ts` / `post-checkout.ts`** — call `placeOrder`, `create`, `markPaid`, and related status functions through this barrel to record a completed purchase.
- **`src/modules/delivery/services/*`** (`actions`, `announce`, `cancel-remainder`, `confirm-wait`, `cut`, `deliver`, `ensure`) — import status marks (`markShipped`, `markDelivered`, `markFulfilmentComplete`), fulfillment helpers (`shipStock`, `refreshShelf`, `readOrder`), and `cancelById` from here.
- **`scripts/ops/reap-orders.ts`** — calls `cancelUnanswered` to sweep stale unpaid orders.
- **`scripts/ops/sweep-order-effects.ts`** — calls `retryPendingEffects` to re-process failed post-cancellation side-effects.
- **`scenarios/jobs.ts`** — invokes `anonymizeDueOrders` (retention) and possibly `cancelUnanswered` on a schedule.
- **`scenarios/flows/shop-history.ts`** — reads stats helpers (`paidBuckets`, `productTotals`, `pipeline`, etc.) via this barrel.
- **`src/modules/cart/tests/integration/stock.test.ts`** — exercises `shipStock`, `refreshShelf`, and order status transitions through the named exports.

## Notes

- Both the **named exports** and the **`orderService` object** are part of the public API. The in-file comment explicitly warns that removing either set will break event wiring (`module.ts`), the cart integration (`orders/index.ts`), and test suites. Do not prune exports without checking all three caller categories.
- Config getters live in `../config` but are re-exported *here* (not from the module root) because of the `local/barrel-allowed-sources` rule: a module's public barrel may only surface services, domain, events, emails, and model. Downstream modules (`invoicing`, `delivery`, `returns`) import shop identity and return address from this file, not from `../config` directly.
- The folder structure (rather than a single file) exists because the service exceeded ~300 lines; see `docs/theory/layers.md` for the layering rationale.
