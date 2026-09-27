---
source: src/modules/orders/services/order-numbering.ts
sha256: 850bdda1cd8ba9e8145c920168c0b3e45c331f77259299d5af4c357844ba262d
generated_at: 2026-09-27T15:14:44.777849+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/services/order-numbering.ts

## Purpose

Formats the repository's atomic yearly counter into the order-number string (`{year}-{sequence}`, e.g. `2026-000041`). It is a receipt number, not a tax-invoice number. All atomicity lives in the repository; this file is purely the presentation/formatting layer.

## Key elements

- **`SEQUENCE_WIDTH`** (const, `6`) — zero-pad width for the sequence portion.
- **`allocateOrderNumber()`** — sole export. Reads the current UTC year, calls `orderRepository.incrementOrderNumberCounter(year)`, then returns a promise resolving to the formatted string. Intended to be called exactly once per order at creation time.

## Relationships

- **`src/modules/orders/repository.ts`** — provides `orderRepository.incrementOrderNumberCounter(year)`; this file is its only consumer for formatting.
- **`src/modules/orders/services/place.ts`** — the expected caller: invokes `allocateOrderNumber()` during order creation and stores the result on `Order.orderNumber`.
- **`src/modules/orders/services/index.ts`** — barrel re-export; makes `allocateOrderNumber` available to consumers of the services module.
- **`src/modules/orders/tests/integration/order-numbering.test.ts`** — integration tests exercising the allocate-and-format flow.

## Notes

- The sequence resets each UTC year; the year is read with `getUTCFullYear()`, so the boundary is midnight UTC, not local time.
- Gaps in the sequence are **by design** (a failed order write burns the number). No rollback or retry logic exists here or is expected from callers.
- Do not treat the returned value as an invoice number; the distinction is documented in `docs/modules/orders.md`.
