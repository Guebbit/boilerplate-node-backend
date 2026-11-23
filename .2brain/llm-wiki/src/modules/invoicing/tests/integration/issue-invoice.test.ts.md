---
source: src/modules/invoicing/tests/integration/issue-invoice.test.ts
source_sha256: 4148f3f2f952b3d66c6bf3712581e1f95c30d7ba6e599293f1a5a23bc6663a6a
context_sha256: 26aba89c2f3e8dd0249889a31c2e4bac748621770cdd5edd0fd2252ce5a236a1
generated_at: 2026-11-22T05:39:04.891722+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/invoicing/tests/integration/issue-invoice.test.ts

## Purpose
Integration tests for invoice issuance, end to end. An order's `pending → paid` transition is the only thing that freezes an invoice. Most tests reach it through `orders`' own `markPaid` and the real `src/modules/invoicing/module.ts` subscription. They never call `issueInvoice` directly, so the event wiring is tested too. The tests that do call `invoicingService.issueInvoice` directly are the race, idempotency and failure cases.

## Key elements
- **Setup**: `setupTestDb()`. `beforeEach` registers the users, products, inventory, orders and invoicing modules via `registerModules`. `afterEach` calls `resetDomainEvents()`.
- **Single `describe`**: "issuing an invoice off ORDER_STATUS_CHANGED". Its tests cover:
  - **Numbering and PII**
    - The invoice gets a number matching `^\d{4}-\d{6}$` once the order is paid.
    - The billing address is stored encrypted under the invoice's own id, so the order's ciphertext was re-encrypted. Tests check this with `decryptInvoiceParty(..., 'invoice', id)`.
    - A line-total check expects `grandTotal` of `'39.80'` for 2 × 19.90.
  - **Buyer address**
    - Walk-in orders have no account, created via `orderService.create` as admin, and the invoice has no `billingAddress`.
    - The invoice bills the billing address, never the ship-to one.
    - An order with only a ship-to address yields no buyer address.
  - **VAT**
    - Per BR-CO-17, VAT is rounded once per rate, not per line. Three 0.10 lines at 22% give a tax of `0.05` and a gross of `0.30`.
    - The order line's `rateType` (`zero_rated` / `exempt`) is carried onto the invoice lines.
  - **Sequencing**
    - Two invoices in the same year get numbers one apart.
  - **Idempotency and races**
    - Concurrent `issueInvoice` calls on the same order return the same invoice, and the counter (`invoiceNumberCounterModel`, keyed by year) stays at `seq` 1.
    - Exactly one `invoice_issued` timeline row is written, read via `timelineOf`.
    - Invoicing again later returns the existing invoice.
  - **Failure**
    - If `insertInvoice` is mocked to reject once with "disk full", the error propagates and no invoice number counter exists afterward. A later retry is then expected to succeed.

## Relationships
- **Kernel**: `@kernel/registry` (`registerModules`), `@kernel/events` (`resetDomainEvents`) and `@kernel/outbox` (`settleOutboxNudges`, imported).
- **Modules registered**: the `users`, `products`, `inventory`, `orders` and `invoicing` module files.
- **Triggering**: `orders/friends/payments` supplies `markPaid`. `orders` exports `orderService`.
- **Invoicing internals**:
  - `invoicingService` (`../../services`) for `issueInvoice`.
  - `invoicingRepository` for `findInvoiceByOrderId` and `insertInvoice`, which is spied on.
  - `invoiceNumberCounterModel` (`../../model`) to inspect the counter.
  - `decryptInvoiceParty` (`../../pii`) to verify encryption.
- **Factories**: `../factories` supplies `waitForInvoice`. The products, users and orders factories supply `createProduct`, `createUser`, `createOrder`, `timelineOf` and `toOrderItem`.
- **Helpers**: `domain-primitives/time` (`yearInZone`) and `@modules/shop` (`shopTimezone`) compute the expected counter year. Shared test helpers come from `@tests/*`.

## Notes
- Invoice creation is asynchronous, driven by events, so tests poll with `waitForInvoice` instead of assuming the invoice exists right after `markPaid`.
- `settleOutboxNudges` and `freezeDate`/`setEnvironment` are imported, but their use is not visible in the portion of the file shown.
- Dates and the counter key use the shop's timezone (`yearInZone(new Date(), shopTimezone())`), not UTC.
- VAT assertions read `taxSummary` fields one by one, because a Mongoose subdocument array trips `toEqual`.
