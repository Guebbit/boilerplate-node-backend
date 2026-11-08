---
source: tests/support/journey-orders.ts
sha256: 51a8472a421658b57e4b3c14439e25b64c61a21a6b81ae70354439b3877837af
generated_at: 2026-11-08T09:56:18.724157+00:00
model: ollama:qwen3.8:27b
---

# tests/support/journey-orders.ts

## Purpose

Shared helper module for the shop-side journey tests. It packages the repetitive "a shopper acts" sequence—creating a customer with an address, filling a cart, checking out, opening and confirming a card payment, and reading back order/payment/stock state—so individual journey tests can focus on the scenario-specific assertions rather than boilerplate HTTP calls.

## Key elements

- **`BasketLine`** (interface) – A single cart line: `productId` + `quantity`.
- **`newShopper()`** – Creates a verified customer (via `createUser`) with a unique email, gives them an address (via `giveAddress`), logs them in, and returns `{ user, email, bearer }`.
- **`placeOrder(bearer, lines, body?)`** – Adds each `BasketLine` to the cart, sets a standard shipping method, then delegates to `checkoutAs`. Returns the parsed `Checkout201Response`.
- **`openIntent(bearer, orderId)`** – POSTs `/payments` to open a card payment. Returns the parsed `CreatePayment201Response` (provider ref is `fake_pi_<id>`).
- **`confirmCard(bearer, paymentId, paymentMethodRef?)`** – POSTs `/payments/:id/confirm`. Returns the **raw** Supertest response (not parsed) so a journey can assert on a non-200 refusal.
- **`payByCard(bearer, orderId)`** – Convenience: calls `openIntent` then `confirmCard`, returns the parsed `ConfirmPayment200Response`.
- **`orderOf(bearer, orderId)`** – GET `/orders/:id`, returns parsed `GetOrderById200Response`.
- **`paymentOf(bearer, orderId)`** – GET `/orders/:id/payments`, returns the **first** item from the list.
- **`stockOf(bearer, productId)`** – GET `/products/:id`, returns `{ onHand, reserved }`.
- **`ledgerOf(bearer, productId)`** – GET `/inventory/movements?productId=…`, returns an array of `reason` strings (newest first).

## Relationships

- **`tests/support/http.ts`** – Provides `api()` (Supertest instance) and `loginBearer()` used throughout.
- **`tests/support/body-of.ts`** – `bodyOf()` parses a Supertest response against a Zod schema; nearly every exported function wraps its call in it.
- **`tests/support/checkout-as.ts`** – `checkoutAs()` is the single place the checkout `PUT` is issued; `placeOrder` delegates to it.
- **`src/modules/users/tests/factories.ts`** – `createUser()` creates the customer record inside `newShopper`.
- **`src/modules/addresses/tests/factories.ts`** – `giveAddress()` attaches an address to the user inside `newShopper`.
- **Journey tests** (`a-receiver-that-stays-down`, `an-integrator-start-to-finish`, `bought-returned-refunded`, `quiet-for-three-years`, `the-hold-that-was-never-paid`, `the-provider-disagrees`) – All import these helpers to script the shop-side steps of their scenario.

## Notes

- **Split payment steps are intentional.** `openIntent` and `confirmCard` are exported separately so a journey (e.g. *the-provider-disagrees*) can interject—assert state, switch tokens, or expect a failure—between the two calls. `payByCard` is only for journeys that need the happy-path shorthand.
- **`confirmCard` is the one function that does not parse the body.** It returns the raw response so tests can branch on status codes (declined, 422, etc.).
- **`paymentOf` always returns `items[0]`.** It assumes the order has exactly one payment; if a journey ever creates multiple, this will silently grab the wrong one.
- **Module-level `shoppers` counter** guarantees unique emails/addresses across tests in a single process run, because the mail outbox is shared. It is not reset between test files; relies on process isolation for cleanliness.
