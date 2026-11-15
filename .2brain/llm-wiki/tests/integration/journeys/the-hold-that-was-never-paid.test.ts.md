---
source: tests/integration/journeys/the-hold-that-was-never-paid.test.ts
sha256: 7e97537adc47132d5593cedbfe408088905c9a29fdd83a3b98607d16428e697c
generated_at: 2026-11-14T23:16:13.395329+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/journeys/the-hold-that-was-never-paid.test.ts

## Purpose

Integration journey test verifying that the reservation sweep correctly expires two kinds of unpaid holds — an abandoned 3-D Secure card challenge and a bank transfer that was never sent. In each case the sweep must release reserved stock, cancel the order, and send the shopper a notification email.

## Key elements

- **`HOUR_MS`** — local constant (3 600 000 ms) used to express the bank-transfer hold advance.
- **`awaiting(staff)`** — helper that calls `GET /payments?displayStatus=incomplete&method=bank_transfer` and returns the list of order IDs staff still sees as pending.
- **`describe('an abandoned 3-D Secure challenge')`** — places an order, opens a payment intent, confirms with a `pm_card_authentication_required` card, advances the clock 16 min past the 15-min hold, drains the `sweep:reservations` queue, then asserts stock restored, order canceled, ledger shows `['expire', 'reserve']`, and one `orders.order-hold-expired` email sent.
- **`describe('a bank transfer nobody sent')`** — same pattern with `paymentMethod: 'bank_transfer'`; advances 169 h past the 168-h hold, asserts the order drops off the awaiting list, stock restored, and one `payments.transfer-expired` email sent.
- **`setupTestDb()`** — ensures an isolated database per run.
- **`beforeEach(useOutboxMail)` / `afterEach`** — captures outbound mail; restores real Jest timers.

## Relationships

- **`src/modules/products/tests/factories.ts`** — `createProduct` seeds a product with known `onHand` and `reserved` counts.
- **`tests/support/clock.ts`** — `freezeDate` pins the clock; `advanceDate` jumps past the hold window.
- **`tests/support/drain.ts`** — `drain('sweep:reservations')` enqueues and processes the reservation-sweep job.
- **`tests/support/http.ts`** — `api`, `authenticateAs`, `loginBearer` for all HTTP calls and fresh token acquisition.
- **`tests/support/journey-orders.ts`** — `newShopper`, `placeOrder`, `openIntent`, `confirmCard`, `orderOf`, `stockOf`, `ledgerOf` provide the order/payment lifecycle helpers.
- **`tests/support/journey-mail.ts`** — `useOutboxMail` captures mail; `mailsTo` asserts delivery of specific template IDs.
- **`tests/support/body-of.ts`** — `bodyOf` parses the typed response body from `api()` calls.
- **`tests/support/contract.ts`** — imported at module level to activate API contract assertions.
- **`tests/support/setup-test-db.ts`** — `setupTestDb` initialises the test database.

## Notes

- Advancing the clock invalidates every previously issued bearer token. Both tests therefore re-acquire tokens via `loginBearer` *after* `advanceDate` — the `staffBefore` token obtained before the jump is not reused.
- The sweep does nothing until `drain('sweep:reservations')` is called; the test relies on this explicit trigger rather than a timer.
- Ledger assertions (`['expire', 'reserve']`) document the expected *order* of stock mutations (expire before the original reserve entry in the returned list), not merely the set of entries.
