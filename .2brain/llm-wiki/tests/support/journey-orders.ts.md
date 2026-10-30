---
source: tests/support/journey-orders.ts
sha256: 51a8472a421658b57e4b3c14439e25b64c61a21a6b81ae70354439b3877837af
generated_at: 2026-10-29T07:09:05.400453+00:00
model: ollama:qwen3.8:27b
---

# tests/support/journey-orders.ts

## Purpose

Shared client-side "shop steps" for journey (integration) tests. It encapsulates the common flow a shopper follows—creating an account with a unique address, filling a cart, checking out into an order, and opening/confirming a card payment—so individual journey tests can focus on the scenario-specific assertions and can interject between the two payment calls (open → confirm) when the story requires it.

## Key elements

- **`BasketLine`** – Interface for a single cart line (`productId`, `quantity`).
- **`newShopper()`** – Creates a verified customer, assigns a unique address, and returns `{ user, email, bearer }`. Uses a module-level counter to guarantee address uniqueness.
- **`placeOrder(bearer, lines, body?)`** – Posts each basket line, sets shipping method to `standard`, then calls `checkoutAs`; returns the parsed `Checkout201Response`.
- **`openIntent(bearer, orderId)`** – POSTs `/payments` and returns the parsed `CreatePayment201Response` (provider ref is `fake_pi_<id>`).
- **`confirmCard(bearer, paymentId, paymentMethodRef?)`** – POSTs the confirm endpoint. **Returns the raw API response** (no `bodyOf` parse) so a journey can assert on refusal payloads.
- **`payByCard(bearer, orderId)`** – Convenience wrapper: `openIntent` → `confirmCard` with default `pm_card_visa`; returns parsed `ConfirmPayment200Response`.
- **`orderOf(bearer, orderId)`** – GET `/orders/:id`; returns parsed `GetOrderById200Response`.
- **`paymentOf(bearer, orderId)`** – GET `/orders/:id/payments`; returns the **first** item of `ListOrderPayments200Response`.
- **`stockOf(bearer, productId)`** – GET `/products/:id`; extracts `{ onHand, reserved }`.
- **`ledgerOf(bearer, productId)`** – GET `/inventory/movements?productId=…`; maps items to their `reason` strings, newest first.

## Relationships

- **Imports** `api` / `loginBearer` from `tests/support/http.ts`, `bodyOf` from `tests/support/body-of.ts`, `checkoutAs` from `tests/support/checkout-as.ts`.
- **Imports** `createUser` from `src/modules/users/tests/factories.ts` and `giveAddress` from `src/modules/addresses/tests/factories.ts`.
- **Consumed by** every journey test in `tests/integration/journeys/` (`a-receiver-that-stays-down`, `an-integrator-start-to-finish`, `bought-returned-refunded`, `quiet-for-three-years`, `the-hold-that-was-never-paid`, `the-provider-disagrees`).

## Notes

- The module-level `shoppers` counter is **not reset** between tests; it relies on process-lifetime uniqueness because the outbox is shared.
- `confirmCard` deliberately skips `bodyOf` parsing—a journey that expects a 4xx/5xx must inspect the raw response. Every other helper parses via `bodyOf`.
- `paymentOf` unconditionally takes `items[0]`; if an order ever has multiple payment records, the returned object will be the first one only.
- The file header lists `requires-module: orders, payments, inventory, products`, indicating the test environment must have those domains booted.
- Shipping method is hard-coded to `'standard'` in `placeOrder`; there is no parameter to override it.
