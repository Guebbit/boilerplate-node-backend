---
source: tests/integration/journeys/the-hold-that-was-never-paid.test.ts
sha256: 121d7748990cf6a87f5cf3009ee071ab6ab1225f9b24f9ff5aac54e4f1752c63
generated_at: 2026-11-08T09:41:03.605296+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/journeys/the-hold-that-was-never-paid.test.ts

## Purpose

Integration test for the **reservation sweep** job: it verifies that when a payment hold lapses without payment, the system releases reserved stock, cancels the order, removes it from the staff "awaiting" list (for bank transfers), and sends the appropriate notification email to the shopper. Two scenarios are covered — an abandoned 3-D Secure card challenge and a bank transfer that was never funded.

## Key elements

- **`describe('an abandoned 3-D Secure challenge')`** — Places an order, opens an intent, confirms a card that returns `pm_card_authentication_required`, then advances the clock 16 min past the 15-min hold. Asserts stock is returned, order is `canceled`, ledger shows `['expire', 'reserve']`, and the shopper receives one `orders.order-card-expired` email.
- **`describe('a bank transfer nobody sent')`** — Places a bank-transfer order, confirms it appears on the staff "awaiting" list, then advances the clock 169 h past the 168-h transfer hold. Asserts the order drops off the list, stock is released, and the shopper receives one `payments.transfer-expired` email.
- **`awaiting(staff)`** — Local helper that calls `GET /payments?displayStatus=incomplete&method=bank_transfer` and returns the array of `orderId` values.
- **`HOUR_MS`** — `3_600_000`, used to compute the transfer-hold advance.
- **`setupTestDb()`** — Runs once per module to provision an isolated database.
- **`beforeEach(useOutboxMail)`** — Resets the in-memory outbox so `mailsTo` assertions are clean per test.
- **`afterEach(() => jest.useRealTimers())`** — Restores real timers after clock-manipulation.

## Relationships

| Neighbor | Interaction |
|---|---|
| `tests/support/setup-test-db.ts` | `setupTestDb()` initialises the per-module test database. |
| `tests/support/contract.ts` | Imported for side-effects (API contract / schema validation setup). |
| `tests/support/http.ts` | `api()` builds HTTP requests; `authenticateAs` / `loginBearer` obtain bearer tokens. |
| `tests/support/clock.ts` | `freezeDate()` pins "now"; `advanceDate(ms)` moves it forward to simulate hold expiry. |
| `tests/support/drain.ts` | `drain()` processes the full outbox of background jobs; `drain('sweep:reservations')` triggers only the reservation-sweep job. |
| `tests/support/body-of.ts` | `bodyOf(response, schema)` validates and unwraps the JSON body against a Zod schema. |
| `tests/support/journey-orders.ts` | Provides `newShopper`, `placeOrder`, `openIntent`, `confirmCard`, `orderOf`, `stockOf`, `ledgerOf` helpers. |
| `tests/support/journey-mail.ts` | `useOutboxMail` clears the mail outbox; `mailsTo(email, template)` asserts delivered messages. |
| `src/modules/products/tests/factories.ts` | `createProduct` seeds a product with a given price and `onHand` stock level. |

## Notes

- **Token invalidation on time travel.** Both tests advance the clock past the hold, which also expires all previously issued access tokens. Every assertion after the advance must re-authenticate via `loginBearer`. Forgetting this is the most common failure mode when editing these tests.
- **Two different hold durations.** Card holds expire at **15 min**; bank-transfer holds expire at **168 h** (7 days). The tests advance just past each boundary (16 min / 169 h).
- **Ledger order.** `ledgerOf` returns entries newest-first, so the expected array is `['expire', 'reserve']` — do not reorder.
- **Different email templates.** Card expiry uses `orders.order-card-expired`; transfer expiry uses `payments.transfer-expired`. They are distinct templates and must not be swapped.
- **`drain` vs `drain('sweep:reservations')`.** The transfer test calls a bare `drain()` *before* the time advance (to flush the order-creation job and populate the awaiting list) and a scoped `drain('sweep:reservations')` *after* (to run only the sweep). Using the wrong variant can cause flakiness.
