---
source: src/modules/invoicing/tests/integration/issue-invoice.test.ts
sha256: b28020c6d689da4b8fef390957dbcd9910a602edbc68e27c2ac44b72b3649969
generated_at: 2026-11-14T20:15:27.954002+00:00
model: ollama:qwen3.8:27b
---

# src/modules/invoicing/tests/integration/issue-invoice.test.ts

## Purpose

End-to-end integration tests for invoice issuance triggered by the `ORDER_STATUS_CHANGED` event. The suite proves that an order's `pending → paid` transition is the sole path to freezing an invoice, exercising the real `module.ts` subscription and event wiring rather than calling `issueInvoice` in isolation. It also covers PII re-encryption, VAT rounding semantics, number allocation under race conditions, timezone-aware year numbering, and timeline bookkeeping.

## Key elements

- **`describe('issuing an invoice off ORDER_STATUS_CHANGED')`** – the top-level suite; every test drives the flow through `markPaid` (for the first several tests) or through direct `invoicingService.issueInvoice` calls (for idempotency/edge-case tests).
- **`beforeEach` / `afterEach`** – registers all five modules (`users`, `products`, `inventory`, `orders`, `invoicing`) via `registerModules`; resets domain events after each test.
- **`waitForInvoice`** (from `src/modules/invoicing/tests/factories.ts`) – polls the database for the asynchronously-created invoice rather than relying on event delivery timing.
- **VAT rounding test (BR-CO-17)** – asserts that tax is rounded once per rate on the aggregate taxable total, not summed from per-line rounded values.
- **Idempotency / race tests** – fire two concurrent `issueInvoice` calls; assert a single invoice, a single counter increment, one `invoice_issued` timeline row, and that a failed insert rolls back the number allocation.
- **Timezone test** – freezes the clock at 23:30 UTC (00:30 in Rome) on 31 Dec to verify the invoice number uses the shop's calendar year, not UTC's.

## Relationships

- **`src/modules/orders/friends/payments.ts` → `markPaid`** – the trigger action that emits `ORDER_STATUS_CHANGED`, which the invoicing module subscribes to.
- **`src/modules/invoicing/module.ts`** – the real subscription under test; registers the event handler that calls `issueInvoice`.
- **`src/modules/invoicing/services/index.ts` → `invoicingService`** – the service whose `issueInvoice` method performs the freeze, numbering, and persistence.
- **`src/modules/invoicing/pii.ts` → `decryptInvoiceParty`** – used to verify that billing-address PII is re-encrypted under the invoice's own id.
- **`src/modules/invoicing/repository.ts` → `invoicingRepository`** – read back for assertions and spied on in the rollback test.
- **`src/modules/invoicing/model.ts` → `invoiceNumberCounterModel`** – inspected to assert counter state (sequential numbering, rollback on failure).
- **`src/modules/orders/tests/factories.ts`** – `createOrder`, `toOrderItem`, `timelineOf` helpers.
- **`src/modules/invoicing/tests/factories.ts`** – `waitForInvoice` polling helper.
- **`src/kernel/events.ts` → `resetDomainEvents`** – teardown to prevent cross-test event leakage.
- **`src/kernel/outbox.ts` → `settleOutboxNudges`** – imported to ensure outbox nudges are processed in the test environment.
- **`src/kernel/registry.ts` → `registerModules`** – wires all five modules into the test DI container.
- **`src/domain-primitives/time.ts` → `yearInZone`** – resolves the shop-calendar year used in number assertions.
- **`src/modules/orders/module.ts`** – registered in `beforeEach`; its `markPaid` subscription chain is the event source under test.
- **`src/modules/inventory/module.ts`** – registered in `beforeEach` as part of the full module graph required by the invoicing flow.

## Notes

- The first five tests deliberately avoid calling `invoicingService.issueInvoice` directly; they go through `markPaid` → event → subscription to prove the wiring. Later tests (idempotency, rollback, timezone) call `issueInvoice` directly to isolate those concerns.
- Mongoose subdocument arrays (e.g. `invoice.taxSummary`) are asserted field-by-field rather than with `toEqual` on the whole array, because `toEqual` trips on Mongoose internal state.
- The PII test asserts that the stored ciphertext differs from the order's original ciphertext (re-encryption under the invoice id) and then decrypts to verify correctness.
- The "gives the number back" test relies on the fact that the counter allocation and the invoice insert share a transaction; a mocked `insertInvoice` rejection leaves the counter document absent.
