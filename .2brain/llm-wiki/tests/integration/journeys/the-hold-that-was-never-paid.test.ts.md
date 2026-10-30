---
source: tests/integration/journeys/the-hold-that-was-never-paid.test.ts
sha256: e2297dc004439e6b07cd96b11e0cf23b0ed64eaa405e116026e837c465d74ba3
generated_at: 2026-10-29T06:57:41.902892+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/journeys/the-hold-that-was-never-paid.test.ts

## Purpose

Journey test verifying that the reservation sweep correctly expires unpaid orders and returns their stock. Covers two hold-expiry variants: an abandoned 3-D Secure card challenge (15-min hold) and a bank transfer that was never sent (168-h hold). For each, it asserts the order is cancelled, reserved stock is released, the product ledger records the expiry, and the shopper receives the appropriate notification email.

## Key elements

- **`awaiting(staff)`** — Helper that queries `GET /payments?displayStatus=incomplete&method=bank_transfer` and returns the list of `orderId`s still awaiting transfer.
- **`describe('an abandoned 3-D Secure challenge')`** — Places an order, opens a payment intent, confirms a card that triggers an auth challenge, then jumps 16 minutes forward and drains `sweep:reservations`. Asserts cancellation, stock release, ledger entries `['expire','reserve']`, and one `orders.order-card-expired` mail.
- **`describe('a bank transfer nobody sent')`** — Places a bank-transfer order, verifies it appears on the staff awaiting list, jumps 169 hours forward, drains the sweep. Asserts the order drops off the awaiting list, stock is released, ledger entries, and one `payments.transfer-expired` mail.
- **`beforeEach(useOutboxMail)`** — Captures outgoing mail into an in-memory outbox for assertions.
- **`afterEach(() => jest.useRealTimers())`** — Restores the real clock after each test's `freezeDate`.

## Relationships

- **`@tests/journey-orders`** — Primary test helpers: `newShopper`, `placeOrder`, `openIntent`, `confirmCard`, `orderOf`, `stockOf`, `ledgerOf`.
- **`@tests/clock`** — `freezeDate` pins the clock at test start; `advanceDate` jumps past the hold window.
- **`@tests/drain`** — `drain('sweep:reservations')` triggers the background sweep job synchronously.
- **`@tests/http`** — `api` for HTTP calls, `authenticateAs` for staff/admin tokens, `loginBearer` for re-authentication after token expiry.
- **`@tests/journey-mail`** — `useOutboxMail` intercepts mail; `mailsTo` queries captured messages by template.
- **`@tests/body-of`** — `bodyOf` extracts and Zod-validates the response body.
- **`@tests/contract`** — Imports OpenAPI contract validation for all HTTP calls.
- **`@tests/setup-test-db`** — `setupTestDb` resets the database before the suite.
- **`@modules/products/tests/factories`** — `createProduct` seeds a product with a given price and `onHand` quantity.

## Notes

- Advancing the clock past the hold also expires all bearer tokens issued before the jump. Every assertion block therefore re-authenticates via `loginBearer` after `advanceDate` — this is intentional, not a bug.
- The sweep is addressed by its job name (`sweep:reservations`) through `drain`, not by an HTTP endpoint.
- The bank-transfer scenario uses `HOUR_MS` (3 600 000 ms) to express the 169-hour jump; the card scenario uses a literal `16 * 60_000`.
- `beforeEach(useOutboxMail)` means each test starts with a fresh mail outbox; no cleanup is needed in `afterEach`.
