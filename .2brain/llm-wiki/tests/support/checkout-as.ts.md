---
source: tests/support/checkout-as.ts
sha256: c23cc766c51dfd35c9b0a1168d3758a6d76410250f070ef722238285b6664fec
generated_at: 2026-10-29T07:06:49.014343+00:00
model: ollama:qwen3.8:27b
---

# tests/support/checkout-as.ts

## Purpose

Encapsulates the standard "check out with the cart's displayed total" flow so that test specs don't need to read the cart and construct the `expectedTotal` body manually. Exists because the `POST /cart/checkout` contract mandates the `expectedTotal` field, and most specs care about something else (idempotency, concurrency, journey sequencing) rather than the price check itself.

## Key elements

- **`ShownTotal`** (interface) — `{ amount: number; currency: string }`; the shape a client's cart screen would present and that the checkout request expects.
- **`shownTotal(bearer)`** — `GET /cart` with the given bearer token, extracts `summary.totalPrice` and `summary.currency`, converts the price to minor units via `toMinorUnits`, and returns a `ShownTotal`.
- **`checkoutAs(bearer, body?, headers?)`** — `POST /cart/checkout` with `Authorization`, any extra headers (e.g. `Idempotency-Key`), and a body of `{ expectedTotal: await shownTotal(bearer), ...body }`. A caller-supplied `body.expectedTotal` overrides the auto-read value.

## Relationships

- **`src/domain-primitives/money.ts`** — imports `toMinorUnits` to convert the major-unit `totalPrice` from the cart summary into the minor-unit integer the checkout API expects.
- **`tests/support/http.ts`** — imports `api` to obtain the shared HTTP client for both the `GET /cart` and `POST /cart/checkout` calls.
- **Test files** (e.g. `checkout-money-reconciliation.test.ts`, `payment-races.test.ts`, `bought-returned-refunded.test.ts`, `cart-races.test.ts`, `journey-orders.ts`, cart and shop contract tests) — import `checkoutAs` / `shownTotal` as the canonical way to complete a checkout step without re-implementing the expected-total dance.

## Notes

- The `body` parameter is spread *after* `expectedTotal`, so a caller can override the auto-computed value (useful for negative tests that deliberately send a wrong total).
- `shownTotal` reads the cart live at call time; in concurrency tests the total may shift between the read and the subsequent `checkoutAs` call if another actor mutates the cart in between.
- Currency is passed through verbatim from the cart summary; `toMinorUnits` is the only conversion applied.
