---
source: tests/support/checkout-as.ts
sha256: 1db2bc7739d8561fefcbb8b0b6dc25f3b4fed88ab5953c56d7a440808a24e562
generated_at: 2026-11-08T09:52:15.311071+00:00
model: ollama:qwen3.8:27b
---

# tests/support/checkout-as.ts

## Purpose

Simulates a real client checkout: reads the caller's cart to obtain its current total, then POSTs that total as `expectedTotal` in the `/cart/checkout` request. It exists so that test specs which are *not* specifically testing price-matching can stop hand-writing the mandatory `expectedTotal` field on every checkout call.

## Key elements

- **`ShownTotal`** (interface) — The shape of the cart total as the checkout API expects it: `amount` (decimal string) and `currency` (string).
- **`shownTotal(bearer)`** — GETs `/cart` with the given `Authorization` header and returns `{ amount, currency }` extracted from `response.body.summary`.
- **`checkoutAs(bearer, body?, headers?)`** — POSTs to `/cart/checkout` with `Authorization`, any extra headers (e.g. `Idempotency-Key`), and a body where `expectedTotal` is auto-filled from `shownTotal`. Any `expectedTotal` supplied in the caller's `body` overrides the auto-fetched one via object spread.

## Relationships

- **`tests/support/http.ts`** — Sole import (`api`). All HTTP requests in this file go through that helper's `api()` factory.
- **`tests/support/journey-orders.ts`** — Sibling support module for order-related flows; likely consumed alongside this file in journey tests that need both checkout and order assertions.
- **Contract tests** (`shop.contract.test.ts`, `api.contract.test.ts`, `ownership-shop.contract.test.ts`) — Call `checkoutAs` to exercise the checkout endpoint without re-deriving the expected total in every case.
- **Integration / concurrency tests** (`checkout-expected-total.test.ts`, `totals.test.ts`, `checkout-money-reconciliation.test.ts`, `cart-races.test.ts`, `payment-races.test.ts`, `bought-returned-refunded.test.ts`) — Use `checkoutAs` (and sometimes `shownTotal` directly) as the standard way to place an order while asserting on response shapes, race conditions, or monetary reconciliation.

## Notes

- The spread order in `checkoutAs` is `{ expectedTotal: await shownTotal(bearer), ...body }`, so a caller-provided `expectedTotal` **wins**. Tests that deliberately send a wrong total (to verify the server rejects it) should pass it in `body`.
- `shownTotal` reads `summary.totalPrice` as a **decimal string**, not a number. Comparisons in assertions must treat it as text.
- The `api()` call in `shownTotal` is awaited inside the object literal passed to `.send()`; this means the GET completes *before* the POST is dispatched, but there is no atomicity guarantee between the two requests (a concurrent cart mutation could change the total between them).
