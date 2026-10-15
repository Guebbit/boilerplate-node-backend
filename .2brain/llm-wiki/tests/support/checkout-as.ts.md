---
source: tests/support/checkout-as.ts
sha256: e656d33ee81cca1fb84e4d2af217e5508078524460302f3f5214f06432d9a2ec
generated_at: 2026-10-15T12:56:14.941931+00:00
model: ollama:qwen3.8:27b
---

# tests/support/checkout-as.ts

## Purpose
Shared test helper that performs a realistic `POST /cart/checkout` call: it first reads the caller's cart via `GET /cart`, extracts the displayed total, and sends that total as the required `expectedTotal` field in the checkout request. This lets specs that are *not* testing price reconciliation avoid re-deriving the total on every call.

## Key elements
- **`ShownTotal`** (interface) — `{ amount: number; currency: string }`, the shape the cart screen presents and the checkout API expects for `expectedTotal`.
- **`shownTotal(bearer)`** (exported async fn) — Calls `GET /cart` with the given `Authorization` header, reads `data.summary`, converts `totalPrice` to minor units via `toMinorUnits`, and returns a `ShownTotal`.
- **`checkoutAs(bearer, body?, headers?)`** (exported async fn) — Calls `POST /cart/checkout`, injecting `expectedTotal` from `shownTotal` unless the caller's `body` already supplies it. Accepts extra headers (e.g. `Idempotency-Key`). Returns the raw HTTP response.

## Relationships
- **`tests/support/http.ts`** — Provides the `api()` request client used by both exported functions.
- **`src/shared-kernel/money.ts`** — Supplies `toMinorUnits`, used by `shownTotal` to normalize the cart's major-unit price into the minor-unit representation the checkout contract requires.
- **Consumer tests** (shop contract, cart API contract, checkout-expected-total, totals, checkout-money-reconciliation, cart-races, payment-races) — Import `checkoutAs` (and sometimes `shownTotal`) to drive checkout requests without manually constructing the `expectedTotal` body.

## Notes
- `shownTotal` converts the cart's major-unit `totalPrice` to minor units before returning; any test asserting on `expectedTotal` must compare against minor units, not the raw cart value.
- `checkoutAs` spreads the caller's `body` *after* `expectedTotal`, so a caller-supplied `expectedTotal` in `body` will override the auto-fetched one — this is the intended escape hatch for price-mismatch tests.
- The helper is transport-agnostic beyond the `api()` helper; it does not set `Content-Type` or any headers beyond what the caller passes.
