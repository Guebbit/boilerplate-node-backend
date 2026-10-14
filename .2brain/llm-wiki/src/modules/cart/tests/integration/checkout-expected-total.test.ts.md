---
source: src/modules/cart/tests/integration/checkout-expected-total.test.ts
sha256: 50f52f97efad5456a2131eaca0e353a659423e24ee40faf3582874e9bad5f3f4
generated_at: 2026-10-14T15:14:38.392134+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/tests/integration/checkout-expected-total.test.ts

## Purpose

Integration tests for `POST /cart/checkout` that verify the **`expectedTotal` invariant**: the buyer is charged only the total the cart screen showed them, and any drift (price, shipping, or basket change) between read and checkout is refused with a `409 CART_TOTAL_CHANGED` carrying both the expected and actual totals. Tests also confirm that a refused checkout is fully clean (no order, no held stock, cart unchanged) and that a buyer can recover by re-submitting with the new total.

## Key elements

- **`shopperWith(price, quantity?)`** — local helper that authenticates a user, assigns a shipping address, creates a product, adds it to the cart, and sets shipping to free pickup. Returns `{ bearer, product }`.
- **`describe('POST /cart/checkout and the total the buyer was shown')`** — nine test cases:
  - Happy path: total matches → `201`.
  - Price bumped after read → `409`, `CART_TOTAL_CHANGED`, details include both `expected` and `actual` totals.
  - Clean-state after refusal: `countOrders()` is 0, `countersOf` shows `reserved: 0`, cart still has 1 item.
  - Two-step recovery: first `409`, then `201` when the buyer resubmits with the `actual` total from the error.
  - Currency mismatch (same amount, `USD` vs `EUR`) → `409`.
  - Basket mutated (extra line added) after read → `409`, actual amount reflects the new quantity.
  - Missing `expectedTotal` → `422`.
  - Malformed `expectedTotal` (negative, fractional, bad currency code, missing currency) → `422` (parameterized with `it.each`).
  - Stock exhaustion + price change → `CART_INSUFFICIENT_STOCK` takes precedence over `CART_TOTAL_CHANGED`.

## Relationships

| Neighbor | Interaction |
|---|---|
| `tests/support/http.ts` | `api()` and `authenticateAs()` for every HTTP request and user setup. |
| `tests/support/checkout-as.ts` | `checkoutAs(bearer, { expectedTotal })` wraps the checkout POST; `shownTotal(bearer)` reads the cart's current total. |
| `tests/support/setup-test-db.ts` | `setupTestDb()` initialises the in-memory DB before the suite. |
| `src/modules/addresses/tests/factories.ts` | `giveAddress(user.id)` ensures a default shipping address exists. |
| `src/modules/products/tests/factories.ts` | `createProduct()` seeds the product; `countersOf()` asserts stock counters after refusal. |
| `src/modules/orders/tests/factories.ts` | `countOrders()` asserts no order row was persisted. |
| `src/modules/products/index.ts` / `…/services/index.ts` | `productService.updateById()` mutates price *directly* (bypassing the API) to simulate a concurrent price change. |
| `src/modules/inventory/index.ts` / `…/services/index.ts` | `inventoryService.adjust()` reduces on-hand stock to test the stock-shortage precedence case. |
| `tests/support/callers.ts` | `testCallerContext` supplies the actor context required by the product service call. |

## Notes

- Tests hit the **real HTTP surface** (supertest-style `api()`), not in-process services, except for the deliberate mid-test mutations (`productService.updateById`, `inventoryService.adjust`) which simulate a concurrent write that would not bump the cart's version.
- `expectedTotal` is **required**: omitting it yields `422`, not `409`.
- The currency field is compared as a string (`EUR` ≠ `EURO`, `EUR` ≠ `USD`); amount alone is not sufficient.
- The "confirm the new total" test demonstrates the intended client recovery loop: read `details.actual` from the `409` body and resend it.
- Stock validation runs **before** total validation — a short line produces `CART_INSUFFICIENT_STOCK` even when the total is also stale.
