---
source: src/modules/invoicing/tests/integration/issue-invoice.test.ts
sha256: c2a4bbcf14fce15bc23cdea572c0f5b2f1c2088e77891c252b21f72587a6c6fb
generated_at: 2026-11-08T06:17:46.731502+00:00
model: ollama:qwen3.8:27b
---

# src/modules/invoicing/tests/integration/issue-invoice.test.ts

## Purpose

Integration test proving that invoice issuance is driven exclusively by the `ORDER_STATUS_CHANGED` event (order `pending → paid`) flowing through the real module subscription, not by a direct `issueInvoice` call. Verifies the full wiring: event emission, subscription handler, PII re-encryption, VAT rounding, sequential numbering, idempotency under race, and timezone-aware year boundaries.

## Key elements

- **`describe('issuing an invoice off ORDER_STATUS_CHANGED')`** — single suite containing all scenarios.
- **`beforeEach` / `afterEach`** — registers the full module graph (`users`, `products`, `inventory`, `orders`, `invoicing`) via `registerModules`; tears down domain events with `resetDomainEvents`.
- **Invoice-creation-on-paid test** — asserts `YYYY-NNNNNN` numbering, re-encrypted billing PII (decrypted via `decryptInvoiceParty`), line count, and grand total.
- **Billing-vs-shipping address tests** — confirms the invoice uses `billingAddress` only; absent when only `shippingAddress` exists.
- **VAT rounding test (BR-CO-17)** — three €0.10 lines at 22% must yield one `round(0.05)` on the rate total, not three per-line roundings summing to €0.06.
- **`rateType` freezing test** — verifies `zero_rated` vs `exempt` carried from order line to invoice line.
- **Sequential-numbering test** — two invoices in the same calendar year differ by exactly 1.
- **Idempotency / race tests** — concurrent `issueInvoice` calls resolve to the same invoice; the counter advances only once; a single `invoice_issued` timeline row is written.
- **Number-rollback test** — mocks `invoicingRepository.insertInvoice` to reject; asserts the counter is null (transaction rolled back) and a retry succeeds with `000001`.
- **Timezone-year test** — freezes the clock to 23:30 UTC on 31 Dec; in Rome (shop TZ) it is already 1 Jan, so the number reads `2027-000001`.

## Relationships

- **`src/kernel/registry.ts`** — `registerModules` wires the full module graph in `beforeEach` so the orders→invoicing subscription is live.
- **`src/kernel/events.ts`** — `resetDomainEvents` in `afterEach` prevents event bleed between tests.
- **`src/kernel/outbox.ts`** — `settleOutboxNudges` is imported (available for settling any outbox side-effects the flow produces).
- **`src/modules/orders/index.ts`** — source of `orderService.markPaid`, the entry point that triggers `ORDER_STATUS_CHANGED`.
- **`src/modules/orders/module.ts`** — registered so its `markPaid` → event-emit path is the real one under test.
- **`src/modules/orders/tests/factories.ts`** — provides `createOrder`, `toOrderItem`, and `timelineOf` (used to assert the `invoice_issued` timeline row).
- **`src/modules/invoicing/module.ts`** — registered so its `ORDER_STATUS_CHANGED` subscription handler is active.
- **`src/modules/invoicing/services/index.ts`** — `invoicingService.issueInvoice` is called directly in the race/rollback tests (and is the handler behind the event-driven path).
- **`src/modules/invoicing/repository.ts`** — `findInvoiceByOrderId` for verification; `insertInvoice` is spied on in the rollback test.
- **`src/modules/invoicing/model.ts`** — `invoiceNumberCounterModel` is queried to assert counter state after each scenario.
- **`src/modules/invoicing/pii.ts`** — `decryptInvoiceParty` verifies re-encryption under the invoice's own id.
- **`src/modules/invoicing/tests/factories.ts`** — `waitForInvoice` polls for the invoice created asynchronously by the subscription.
- **`src/domain-primitives/time.ts`** — `yearInZone` extracts the shop-timezone year used to build/verify invoice numbers.
- **`src/modules/inventory/module.ts`** — registered to satisfy the module graph; no direct test assertions against it.

## Notes

- The file deliberately avoids calling `issueInvoice` for the happy-path tests; it goes through `orderService.markPaid` to prove the subscription wiring. Only the idempotency, rollback, and timezone tests call `issueInvoice` directly (the order is already `paid`, so no event fires).
- `taxSummary` is a Mongoose subdocument array; the test reads fields individually rather than using `toEqual` on the array to avoid Mongoose `toBSON` interference.
- The timezone test uses `freezeDate` + `try/finally` with `jest.useRealTimers()`; forgetting the `finally` block would leak a fake clock into subsequent tests.
- The `setupTestDb()` call is at module top-level (not inside `beforeEach`), meaning the test DB is provisioned once per file run.
