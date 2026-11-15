---
source: tests/integration/journeys/bought-returned-refunded.test.ts
sha256: d05b22452345dcdb1efb3c5f6bf4ce4867e009be7bee7905d542d5a9091d959f
generated_at: 2026-11-14T23:15:51.964115+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/journeys/bought-returned-refunded.test.ts

## Purpose

End-to-end journey test that verifies cross-module consistency after a full purchase → partial return → full return → refund cycle. It asserts that money, inventory, invoicing documents, sales stats, audit logs, and outbound mail all agree with one another to the cent and the unit. A second scenario confirms that a staff member buying from their own shop and receiving a refund produces a correct audit trail attributing the order to themselves.

## Key elements

- **`SHOPPER`** – constant holding the shopper's signup credentials (email, username, password) used throughout the first test.
- **`salesTotals(bearer)`** – helper that fetches `/stats/sales` for the 2026 calendar year and returns the first currency's totals object.
- **`it('adds up across money, stock, documents, stats, audit and mail', …)`** – main journey: signup → verify → cart → checkout → pay → ship → deliver → partial return → full return. Asserts stock levels after each phase, payment/refund amounts, invoice + sequential credit-note numbers, audit-action counts, and per-template mail counts.
- **`sendBack(lines)`** (local helper inside the first test) – creates a return, approves it if needed, receives it, drains async work, and returns the final return object.
- **`it('records a staff buyer's refund of their own order as theirs', …)`** – a moderator (who holds `create:Refund`) buys one product, pays, and receives a refund; asserts the audit row attributes the refund to the buyer's own order.
- **`setupTestDb()`** – called at module scope to provision the test database.
- **`beforeEach(useOutboxMail)`** – resets the in-memory mail outbox before every test.

## Relationships

- **`tests/support/setup-test-db.ts`** – provides `setupTestDb` to create a fresh schema per run.
- **`tests/support/contract.ts`** – imported for global contract-test assertions (response-shape validation).
- **`tests/support/http.ts`** – source of `api`, `authenticateAs`, `authenticateAsRole`, and `loginBearer`; every HTTP call in the file goes through these.
- **`tests/support/body-of.ts`** – `bodyOf` validates each response against its Zod schema and returns a typed object, so every assertion works on a checked shape.
- **`tests/support/checkout-as.ts`** – `checkoutAs` encapsulates the cart-finalization call that creates the order.
- **`tests/support/drain.ts`** – `drain` flushes queued background jobs (payments, mail, inventory) so assertions see settled state.
- **`tests/support/journey-mail.ts`** – `useOutboxMail` (reset hook), `waitForMail` (poll for a verification email), and `mailsTo` (filter outbox by recipient + template) are the mail-assertion toolkit.
- **`tests/support/journey-orders.ts`** – `paymentOf` and `stockOf` are convenience getters that query the payment and inventory for a given order/product.
- **`src/modules/products/tests/factories.ts`** – `createProduct` seeds products with a given price and on-hand stock before the journey starts.
- **`src/modules/invoicing/index.ts`** – re-exports `invoicingService`, used to look up the invoice linked to the order (verifying the `2026-NNNNNN` number format).
- **`src/modules/invoicing/services/index.ts`** – barrel that makes `invoicingService` importable from the module root.

## Notes

- The test asserts **cross-module invariants only**; each individual rule (e.g. "shipping is excluded from partial refunds") is covered by module-level unit tests elsewhere.
- A **partial** return (1 of 2 dog-food units) refunds only the goods (`20.00`); the **final** return (remaining dog-food + toy) includes the shipping cost (`55.00` = 20 + 30 + 5). This two-step refund/credit-note split is a deliberate scenario choice.
- Credit notes must be **sequential within the same series** as the invoice (`2026-000001`, `2026-000002`) and each must link back to its payment refund via `refundId`.
- `drain()` is called after payment confirmation and after each `receive` to let async side-effects (refund creation, mail dispatch, stock release) settle before assertions run.
- The second test deliberately uses a **moderator** (not admin) as the buyer to exercise the "staff-is-also-a-customer" path and to confirm the audit log records the refund under the buyer's own order rather than under a staff override.
- The shipment-creation call sets a random `Idempotency-Key` (`randomUUID()`) to satisfy the delivery API's replay-safety contract.
