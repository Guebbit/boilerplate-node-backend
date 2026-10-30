---
source: src/modules/invoicing/tests/integration/issue-invoice.test.ts
sha256: 319401b1497bacf1d8db6bc2cf4cb92a04d86b351a0f8a9a17abcda933c15bee
generated_at: 2026-10-29T04:17:33.350275+00:00
model: ollama:qwen3.8:27b
---

# src/modules/invoicing/tests/integration/issue-invoice.test.ts

## Purpose

Integration test suite that verifies invoice issuance end-to-end via the real event subscription path: an order's `pending → paid` transition triggers invoice freezing through `orders`' `markPaid` and the `invoicing` module's `ORDER_STATUS_CHANGED` handler. It also exercises idempotency, number allocation/rollback, PII re-encryption, VAT rounding, and timezone-aware numbering directly through `invoicingService.issueInvoice` to simulate race and failure scenarios.

## Key elements

- **`describe('issuing an invoice off ORDER_STATUS_CHANGED')`** — the sole suite; every test either goes through `orderService.markPaid` (event-path) or calls `invoicingService.issueInvoice` directly (race/failure-path).
- **Freeze-on-paid test** — asserts invoice number format (`YYYY-NNNNNN`), line count, grand total, and that billing PII is re-encrypted under the invoice's own `_id`.
- **Billing vs. shipping address tests** — confirm the invoice carries the billing address (or `undefined` when absent) and never the ship-to address.
- **VAT rounding test (BR-CO-17)** — three 0.10 lines at 22 % must yield a single 0.05 tax amount, not a sum of per-line rounded values.
- **`rateType` freeze test** — verifies `zero-rated` and `exempt` are carried from order line → invoice line.
- **Numbering tests** — sequential sequence within a shop-timezone calendar year; two invoices one apart.
- **Idempotency / race tests** — concurrent `issueInvoice` calls produce one invoice, one timeline row, and `counter.seq` stays at 1.
- **Rollback test** — mocks `invoicingRepository.insertInvoice` to reject; asserts the number counter is not persisted (shared transaction) and the next attempt allocates `000001`.
- **Calendar-year test** — freezes a date where UTC year ≠ shop-timezone year; expects the shop's year in the number.
- **Printed-date zone test** (truncated in source) — verifies the zone is frozen at issuance so later config changes don't shift the document's date.

## Relationships

- **`src/kernel/registry.ts`** — `registerModules` in `beforeEach` wires all five modules so the real event subscription exists.
- **`src/kernel/events.ts`** — `resetDomainEvents` in `afterEach` clears the in-memory event bus between tests.
- **`src/kernel/outbox.ts`** — `settleOutboxNudges` imported for async outbox settling (used in helper flows).
- **`src/modules/orders/services/index.ts`** — `orderService.markPaid` is the trigger that fires the `ORDER_STATUS_CHANGED` event.
- **`src/modules/orders/index.ts`** — `yearInZone` and `orderService` re-exports used in assertions and calls.
- **`src/modules/orders/domain/shop-time.ts`** — `shopTimezone()` supplies the IANA zone for the calendar-year test.
- **`src/modules/orders/tests/factories.ts`** — `createOrder`, `toOrderItem`, `timelineOf` build fixtures and inspect the order timeline.
- **`src/modules/invoicing/module.ts`** — registered so its `ORDER_STATUS_CHANGED` subscription is live.
- **`src/modules/invoicing/services/index.ts`** — `invoicingService.issueInvoice` is the unit under test in race/failure scenarios.
- **`src/modules/invoicing/repository.ts`** — `findInvoiceByOrderId` for post-condition checks; `insertInvoice` spied in the rollback test.
- **`src/modules/invoicing/pii.ts`** — `decryptInvoiceParty` to read encrypted billing address with the correct key context.
- **`src/modules/invoicing/model.ts`** — `invoiceNumberCounterModel` queried directly to assert counter state.
- **`src/modules/invoicing/tests/factories.ts`** — `waitForInvoice` polls for the asynchronously created invoice.
- **`src/modules/inventory/module.ts`** — registered as a dependency of the orders module (product stock checks at `markPaid`).

## Notes

- The event-path tests intentionally avoid calling `issueInvoice` directly; they prove the `ORDER_STATUS_CHANGED` → subscription → freeze chain. The race/failure tests call `issueInvoice` directly because they need concurrent control that the event bus doesn't provide.
- PII is re-encrypted under the **invoice's** `_id` at freeze time, not the order's. Assertions must pass `'invoice'` role and `invoice._id` to `decryptInvoiceParty`; using the order id will not decrypt.
- Mongoose subdocument arrays (`invoice.taxSummary`, `invoice.lines`) are not plain JS objects; `toEqual` on the whole array fails. The tests assert field-by-field or use `.map()` to project plain values.
- The rollback test relies on the counter increment and the insert sharing a single transaction — if the implementation ever decouples them, the `counter` assertion will break.
- `setupTestDb()` and `setEnvironment` are called at module scope (outside `beforeEach`), so they run once for the whole file.
- The calendar-year test uses `freezeDate` inside a `try/finally` with `jest.useRealTimers()` cleanup; other tests do not freeze time, so they rely on the real clock.
