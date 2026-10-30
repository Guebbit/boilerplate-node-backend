---
source: tests/integration/journeys/bought-returned-refunded.test.ts
sha256: 74fd41bd5c67f43e4c9a56be377c1bc254e90143a920bba7a1a55672d892de70
generated_at: 2026-10-29T06:56:59.975287+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/journeys/bought-returned-refunded.test.ts

## Purpose

Integration journey test that drives a complete **buy → partial return → full return** cycle through the HTTP API and verifies the end state is consistent across payments, inventory, invoicing (invoices + credit notes), sales stats, audit logs, and outgoing mail. A second journey covers a staff member (moderator) purchasing from and refunding their own shop order, asserting the audit trail attributes it correctly. The file exists to catch cross-module drift that individual unit tests cannot see.

## Key elements

- **`it('adds up across money, stock, documents, stats, audit and mail', …)`** — The main journey. Signs up a shopper, checks out two products (2 × 20 + 1 × 30 + 5 shipping = 75), pays by card, ships/delivers, then performs a partial return (1 unit → refund 20, no shipping) and a full return (remaining 2 units + shipping → refund 55). Asserts payment totals, per-product stock levels, sales stats, invoice/credit-note numbers and totals, audit-log action counts, and mail delivery (one mail per template, correct subjects).
- **`it('records a staff buyer's refund of their own order as theirs', …)`** — A moderator buys one unit, pays, then requests a refund on their own order. Verifies the refund succeeds and the audit row identifies the order as the moderator's.
- **`sendBack(lines)`** (inner helper) — Encapsulates the request → (approve if needed) → receive return flow, then calls `drain()`.
- **`salesTotals(bearer)`** (inner helper) — Reads `/stats/sales` for the 2026 window and returns the first currency's totals.
- **`SHOPPER`** — Fixed credentials object used for the first journey's signup/login.

## Relationships

| Neighbor | How this file uses it |
|---|---|
| `tests/support/setup-test-db.ts` | Calls `setupTestDb()` at module top-level to provision a clean database. |
| `tests/support/contract.ts` | Side-effect import (`import '@tests/contract'`) to register contract/fixture setup before tests run. |
| `tests/support/http.ts` | Provides `api`, `authenticateAs`, `authenticateAsRole`, `loginBearer` for all HTTP calls. |
| `tests/support/body-of.ts` | `bodyOf(response, Schema)` extracts and Zod-validates the response body. |
| `tests/support/checkout-as.ts` | `checkoutAs(bearer, { addressId })` performs the cart → checkout POST in one step. |
| `tests/support/drain.ts` | `drain()` flushes pending async side-effects (mail, invoicing, stock updates) before assertions. |
| `tests/support/journey-mail.ts` | `useOutboxMail` (per-test reset), `waitForMail` (poll for verification token), `mailsTo` (assert mail subjects). |
| `tests/support/journey-orders.ts` | `paymentOf(staff, orderId)` and `stockOf(staff, productId)` query admin endpoints for payment and inventory state. |
| `src/modules/products/tests/factories.ts` | `createProduct({ price, onHand })` seeds products for the journey. |
| `src/modules/invoicing/index.ts` | Imports `invoicingService` to call `findInvoiceForOrder(order.id)` and verify the invoice number format. |

## Notes

- **`drain()` is load-bearing.** Several side-effects (mail send, credit-note creation, stock decrement) are async. Omitting a `drain()` before an assertion will produce flaky failures. The test calls it after payment confirmation, after each delivery/return, and inside `sendBack`.
- **Shipping-refund rule under test:** a partial return (not all units) refunds goods only; the final return that zeroes out the order refunds goods + the original shipping cost. This is an intentional business rule the test locks in.
- **Credit-note numbering** is expected to be sequential within the same year-series as the invoice (`2026-000001`, `2026-000002`), not independent per-refund numbers.
- **`setupTestDb()` runs once per file** (module scope), not per test. The two `it` blocks share the same database instance but get a fresh outbox via `beforeEach(useOutboxMail)`.
- The second journey uses a **moderator** (not admin) as the buyer to exercise the `create:Refund` permission path; the admin bearer is only used for verification reads.
