---
source: src/modules/returns/tests/integration/receive.test.ts
sha256: 9c19a2ba8c12b0ebbb2b59861f26f83ae20f4e4262fda4071f3d8f1dd1b851b5
generated_at: 2026-10-15T11:59:59.803962+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/tests/integration/receive.test.ts

## Purpose

Integration tests for the `receiveReturn` operation. They exercise the full receive-against-real-DB + fake-payment-provider path: inventory restock, refund creation, order/payment status projection, event emission, idempotency, concurrency safety, and the customer email notification — all in one transactional flow.

## Key elements

- **`paidAndDelivered(shipping?, shippingMethod?, mugTaxClass?)`** — Fixture helper. Creates a user, two products (shirt ×2, mug ×1), an order, reserves inventory via `inventoryService`, opens and confirms a card payment, then advances the order to *delivered*. Returns a handle to the created entities.
- **`approvedReturn(fixture, reason?, lines?)`** — Opens a return (all lines or a subset) and, for non-withdrawal reasons, approves it. Returns the return id.
- **`paymentOf(orderId)` / `wireOrder(orderId)`** — Convenience readers that fetch the payment record or the order's JSON projection, throwing loudly on failure.
- **`waitFor(check)`** — Polls a boolean predicate (10 ms interval, 3 s timeout) to await fire-and-forget event-listener side-effects (e.g. `RETURN_CLOSED` fired after the refund lands).
- **`describe('the statuses the order shows beside its own')`** — Asserts `returnStatus` and `paymentStatus` transitions on the order projection through requested → in_progress → returned / partially_returned.
- **`describe('receiving a return')`** — Core suite covering: full restock + refund + `RETURN_RECEIVED`/`RETURN_CLOSED` events; one restock movement per line with correct `reference`/`note`; partial-line receipt (only returned lines restocked, payment stays *succeeded*); idempotency (second call → 409 `RETURN_NOT_RECEIVABLE`); concurrent race (exactly one winner); guard against receiving an unapproved return; 404 for missing id; email notification via mocked `enqueueEmail`.

## Relationships

- **`src/infrastructure/adapters/mailer.ts`** — `enqueueEmail` is jest-mocked; tests assert the `returns.notice` template is enqueued to the customer.
- **`src/kernel/events.ts`** — `onDomainEvent` subscribes to `RETURN_RECEIVED` / `RETURN_CLOSED`; `resetDomainEvents` clears subscriptions after each test.
- **`src/kernel/access/tenant.ts`** — `DEPLOYMENT_TENANT_ID` is imported (used implicitly via `registerCheckoutModules` or tenant-scoped fixtures).
- **`src/modules/access/index.ts`** — `assignRole` is imported (role setup for admin actions).
- **`src/modules/delivery/tests/factories.ts`** — `carryOrderTo` advances the order to *delivered*, which de-reserves stock and makes the items eligible for return.
- **`src/modules/inventory/index.ts`** — `inventoryService` is called to reserve stock in the fixture and to query `listMovements` for restock assertions.
- **`src/modules/invoicing/index.ts`** — `findCreditNotesForOrder` / `CreditNoteDocument` imported for credit-note verification (visible in truncated section).
- **`src/modules/invoicing/module.ts`** — `invoicingModule` registered via `registerCheckoutModules` so credit-note issuance is wired in.
- **`src/modules/orders/index.ts`** — `orderService` imported (used in truncated portion for order-state assertions).
- **`src/modules/payments`** (not in neighbor list but heavily used) — `createIntent`, `confirmPayment`, `paymentService`, `paymentsModule` drive the fake-provider refund path.

## Notes

- **Real DB, fake provider.** `setupTestDb()` is invoked at module scope; no in-memory DB. The payment provider is the `fake` adapter, so refunds succeed synchronously but the *closing* of the return is driven asynchronously by the `PAYMENT_REFUNDED` event listener — hence the `waitFor` polling helper.
- **Concurrency guarantee is explicit.** The "racing receipts" test fires two `receiveReturn` calls via `Promise.all` and asserts exactly one succeeds. This locks in the transactional/optimistic-lock behavior of the service.
- **`mugTaxClass` parameter.** Passing `'reduced'` exercises a lower VAT rate on the mug line, which affects the refund amount calculation (visible in the truncated tax-class tests).
- **Email assertion pattern.** Tests locate the correct `enqueueEmail` call by matching the second argument (template name) rather than call order, keeping assertions resilient to other mailers firing in the same flow.
- **Truncated content.** The file continues beyond what is shown here (credit-note assertions, tax-class scenarios, decline-path tests). The sections above cover the visible portion.
