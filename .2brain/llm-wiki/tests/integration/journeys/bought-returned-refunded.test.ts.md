---
source: tests/integration/journeys/bought-returned-refunded.test.ts
sha256: a76c7e452052b2f51041bb892761959d4e713460bdf96bd39143d056482764d5
generated_at: 2026-11-08T09:40:19.616454+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/journeys/bought-returned-refunded.test.ts

## Purpose

End-to-end integration test that walks a shopper through the full buy → partial return → final return → refund cycle and asserts cross-module consistency: money balances to the cent, stock is restored only for returned units, invoice/credit-note numbers are sequential, stats and audit logs reflect every event exactly once, and each customer email is sent exactly once. A second test verifies that a staff member purchasing from their own shop gets a refund whose audit row attributes the order to them.

## Key elements

- **`SHOPPER`** – fixed credentials used for the shopper journey (signup, verification, login).
- **`salesTotals(bearer)`** – helper that hits `GET /stats/sales?from=2026-01-01&to=2026-12-31` and returns the `currencies[0].totals` object for assertions.
- **`sendBack(lines)`** (inner function, first test) – submits a return, approves it if status is `requested`, receives it, drains, and returns the received response.
- **`it('adds up across money, stock, documents, stats, audit and mail')`** – the main journey: signup → verify → cart (2 × dog food + 1 toy) → checkout (75.00) → card payment → ship/deliver → partial return (1 dog food, refund 20.00) → final return (1 dog food + 1 toy, refund 55.00) → assertions on stock, payment record, invoice/credit-notes, audit counts, and mail.
- **`it('records a staff buyer's refund of their own order as theirs')`** – a moderator (holding `create:Refund`) buys one unit, returns it, and the test verifies the audit row marks the refund as the moderator's own order.
- **`setupTestDb()`** – top-level call that initialises the shared test database.
- **`beforeEach(useOutboxMail)`** – resets the mail outbox between tests.

## Relationships

- **`tests/support/setup-test-db.ts`** – calls `setupTestDb()` to seed/reset the database before the suite runs.
- **`tests/support/http.ts`** – provides `api()` (HTTP client), `authenticateAs` / `authenticateAsRole` (bearer tokens), and `loginBearer` (shopper sign-in).
- **`tests/support/body-of.ts`** – wraps every response with `bodyOf(response, ZodSchema)` to parse and type the payload.
- **`tests/support/checkout-as.ts`** – `checkoutAs(bearer, { addressId })` encapsulates the cart → checkout POST.
- **`tests/support/drain.ts`** – `drain()` is awaited after each async event (payment, delivery, return) to let background jobs finish before assertions.
- **`tests/support/journey-mail.ts`** – `useOutboxMail` (beforeEach reset), `waitForMail` (blocks until a template arrives), and `mailsTo` (queries sent mail for assertions).
- **`tests/support/journey-orders.ts`** – `stockOf(bearer, productId)` and `paymentOf(bearer, orderId)` fetch inventory and payment records for assertions.
- **`tests/support/contract.ts`** – side-effect import (`import '@tests/contract'`) that registers API contract helpers/guards for the test runtime.
- **`src/modules/products/tests/factories.ts`** – `createProduct({ price, onHand })` creates deterministic products without hitting the API.
- **`src/modules/invoicing/index.ts`** – exports `invoicingService`, used to call `findInvoiceForOrder(order.id)` and verify the invoice number format.
- **`src/modules/invoicing/services/index.ts`** – the service layer behind `invoicingService`; the test interacts with it directly (not via HTTP) to read the generated invoice.

## Notes

- **Shipping allocation on return:** a *partial* return refunds goods value only (shipping stays with the shop); the *final* return (all units gone) refunds the remaining goods **plus** the original shipping cost. The test encodes this as 20.00 + 55.00 = 75.00.
- **`drain()` after every state change** is mandatory; omitting it causes flaky assertions because payment confirmations, deliveries, and return receptions are processed asynchronously.
- **Audit assertions are exact counts** (e.g., `admin.payment.refunded` appears exactly twice, not ≥ 2), so any duplicate or missing audit entry fails the test.
- **Credit-note numbers are asserted as a literal sequence** (`'2026-000001'`, `'2026-000002'`), meaning the test depends on a clean/incrementing numbering series and will break if the series is shared across test runs.
- **The staff self-purchase test uses a `moderator`**, not an admin, to prove the refund path works for a role that has the permission but is not the top-level admin.
- **Stats query hard-codes 2026 dates**; if the system clock or test fixture changes the "current" year, the stats assertions will silently return zero.
