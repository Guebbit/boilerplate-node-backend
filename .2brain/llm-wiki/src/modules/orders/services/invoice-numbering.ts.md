---
source: src/modules/orders/services/invoice-numbering.ts
sha256: d1b30292a8de87b0044aafad21cdd77d2a5e794c2cd09202ad819a04fe7ae1b4
generated_at: 2026-09-23T19:07:12.007633+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/services/invoice-numbering.ts

## Purpose

Converts the repository's atomic yearly counter into a formatted invoice number (`{year}-{sequence}`) compliant with EU VAT Directive 2006/112/EC Art. 226. The file handles only the string formatting; atomicity is delegated to the repository.

## Key elements

- **`SEQUENCE_WIDTH`** (const, `6`) — fixed zero-padding width for the sequence portion. Intentionally not configurable.
- **`allocateInvoiceNumber()`** (exported) — returns `Promise<string>`. Reads the current UTC year, calls `orderRepository.incrementInvoiceCounter(year)`, and formats the result as `{year}-{sequence}` zero-padded to 6 digits (e.g. `2026-000041`).

## Relationships

- **`src/modules/orders/repository.ts`** — imports `orderRepository`; calls its `incrementInvoiceCounter(year)` method to obtain the next atomic sequence number for the given year.
- **`src/modules/orders/services/index.ts`** — barrel file for the orders services; re-exports this module so callers can import from the services index.
- **`src/modules/orders/services/place.ts`** — the order-creation flow that calls `allocateInvoiceNumber()` exactly once per new order and stores the result on `Order.invoiceNumber`.
- **`src/modules/orders/tests/integration/invoice-numbering.test.ts`** — integration tests exercising the allocation and formatting logic.

## Notes

- Uses **UTC year** (`getUTCFullYear`), not the server-local year.
- If the order insert that follows the allocation fails, the sequence number is consumed and **never reused**. This produces a gap in the numbering, which is legally acceptable under the directive; no rollback is attempted.
- The sequence width is a hard-coded constant, not a configuration option — the directive requires only sequential, gapless numbering, not a fixed digit count.
- The function is designed to be called **once per order** and never re-invoked for an existing order, so re-downloaded invoices always display the same number.
