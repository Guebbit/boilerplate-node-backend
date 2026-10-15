---
source: src/modules/invoicing/tests/integration/issue-invoice.test.ts
sha256: ff85a3586200d4e4967559b3db7f8a3cce250e895617c338107b2ec4fe2cbc37
generated_at: 2026-10-15T10:40:13.850472+00:00
model: ollama:qwen3.8:27b
---

# src/modules/invoicing/tests/integration/issue-invoice.test.ts

## Purpose

Integration test proving that an order's `pending → paid` transition — triggered via the real `markPaid` path and the invoicing module's event subscription — freezes exactly one correct invoice. It validates the full wiring (event → listener → `issueInvoice`), PII re-encryption, VAT rounding semantics, numbering, and idempotency without calling `issueInvoice` in isolation (except in the race/idempotency block).

## Key elements

- **`waitForInvoice(orderId)`** – Polling helper (10 ms tick, 2 s timeout) that waits for the fire-and-forget `ORDER_STATUS_CHANGED` listener to persist an invoice, then returns it.
- **`describe('issuing an invoice off ORDER_STATUS_CHANGED')`** – The single test suite; every case drives the flow through `markPaid` + `waitForInvoice` unless it explicitly exercises `issueInvoice` for race/idempotency scenarios.
- **`beforeEach` / `afterEach`** – Registers all five modules via `registerModules` and resets domain events after each test.
- **PII assertions** – Verifies billing address is stored encrypted under the *invoice* ID (not the order ID) and decrypts with `decryptInvoiceParty(addr, 'invoice', invoice._id)`.
- **VAT rounding case (BR-CO-17)** – Three 0.10 lines at 22 % must produce a single `taxAmount` of 0.05, not the sum of per-line rounded values.
- **`rateType` freezing case** – Asserts `zero-rated` vs `exempt` survive from order line onto invoice line.
- **Numbering cases** – Same-year sequential numbering, year determined by shop timezone (not UTC), and counter rollback on failed insert.
- **Idempotency / race cases** – Two concurrent `issueInvoice` calls yield one invoice, one timeline row, and counter `seq = 1`; a later call returns the existing invoice.

## Relationships

- **`src/modules/orders/index.ts`** – Exports `markPaid`, `shopTimezone`, `yearInZone` used to drive the transition and assert the calendar year.
- **`src/modules/orders/module.ts`** – Registered so its `ORDER_STATUS_CHANGED` publisher fires during `markPaid`.
- **`src/modules/orders/services/status.ts`** – Implementation behind `markPaid`; the event source under test.
- **`src/modules/invoicing/module.ts`** – Registered so its subscription to `ORDER_STATUS_CHANGED` is the listener being exercised.
- **`src/modules/invoicing/services/issue-invoice.ts`** (via `services/index.ts`) – The `issueInvoice` service called directly in the race/idempotency tests.
- **`src/modules/invoicing/repository.ts`** – `invoicingRepository.findInvoiceByOrderId` (polling) and `insertInvoice` (spied in the rollback test).
- **`src/modules/invoicing/model.ts`** – `invoiceNumberCounterModel` used to inspect/verify the year counter after operations.
- **`src/modules/invoicing/pii.ts`** – `decryptInvoiceParty` to assert re-encryption correctness.
- **`src/kernel/registry.ts`** – `registerModules` in `beforeEach`.
- **`src/kernel/events.ts`** – `resetDomainEvents` in `afterEach` to prevent cross-test event bleed.
- **`src/modules/inventory/module.ts`** – Registered (required by the orders → invoicing chain) but not directly asserted.

## Notes

- Most cases intentionally avoid calling `issueInvoice` directly so the test also validates the event-subscription wiring in `invoicing/module.ts`. Only the race, idempotency, and rollback cases invoke it explicitly.
- `waitForInvoice` is necessary because the listener is fire-and-forget; there is no awaitable promise to attach to.
- Mongoose subdocument arrays (e.g. `taxSummary`) are not plain data; `toEqual` fails on them. The VAT test reads individual fields to work around this.
- The "gives the number back" test spies on `invoicingRepository.insertInvoice` — the counter and insert share a transaction, so a rejected insert rolls the allocation back.
- `freezeDate` (from `@tests/clock`) is used in the timezone test to simulate 00:30 Rome on 1 Jan while UTC is still 31 Dec.
- The `invoiceNumberCounterModel` import comes from the local `../../model` path, not from a barrel — keep that in mind when refactoring the module's exports.
