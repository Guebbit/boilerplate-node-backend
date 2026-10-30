---
source: src/modules/orders/services/order-numbering.ts
sha256: fb1f23e4f27a34667d05ba6a1bab36dc758504634524ad3bb4baec5701f1b7af
generated_at: 2026-10-29T04:47:54.787369+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/services/order-numbering.ts

## Purpose

Converts the repository's atomic yearly counter into the human-readable order number format (`{year}-{sequence}`, zero-padded) and provides a tolerant parser for user-typed numbers. It decides *the string*; the atomicity guarantee lives in the repository.

## Key elements

- **`parseOrderNumber(raw: string): string | undefined`** — Normalises a customer-typed number (tolerates surrounding whitespace, a leading `#`, and an unpadded sequence) back to the canonical zero-padded form, or returns `undefined` if it doesn't match at all.
- **`allocateOrderNumber(): Promise<string>`** — Fetches the next sequence for the shop's current calendar year via `orderRepository.incrementOrderNumberCounter(year)` and returns the formatted string (e.g. `2026-000041`). Marked `@internal`; intended to be called exactly once at order creation.
- **`QUOTED_ORDER_NUMBER`** (private) — Regex `^(\d{4})-(\d{1,9})$` used by the parser to validate shape after trimming and `#` removal.

## Relationships

- **`src/infrastructure/persistence/yearly-counter.ts`** — Source of `formatYearlySequence`, the shared formatter that both the parser and the allocator use to produce the canonical `{year}-{padded-seq}` string.
- **`src/modules/orders/domain/shop-time.ts`** — Source of `yearInZone`, used by `allocateOrderNumber` to derive the current year in the shop's timezone.
- **`src/modules/orders/repository.ts`** — Provides `orderRepository.incrementOrderNumberCounter(year)`, the atomic increment that underlies allocation.
- **`src/modules/shop/index.ts`** — Source of `shopTimezone`, which determines *which* calendar year the counter is scoped to.
- **`src/modules/orders/services/place.ts`** — Downstream caller that invokes `allocateOrderNumber` once during order creation and stores the result on `Order.orderNumber`.
- **`src/modules/orders/services/read.ts`** — Consumer of `parseOrderNumber` when resolving a customer-supplied number for lookups/filters.
- **`src/modules/orders/tests/unit/order-number.test.ts`** / **`src/modules/orders/tests/integration/order-numbering.test.ts`** — Unit tests for parse/allocate logic; integration tests for the counter interaction.

## Notes

- An order number is a **receipt number**, not a tax invoice number (see `docs/modules/orders.md`). Do not conflate the two.
- A gap in the sequence is expected and acceptable: if the subsequent order write fails after `allocateOrderNumber` resolves, the burned number is never recycled. No rollback is attempted (mirrors Shopify's behaviour).
- `allocateOrderNumber` is `@internal` by convention — no sibling service should call it directly, preventing accidental double-allocation.
- The parser intentionally accepts a 1-to-9-digit sequence (unpadded input) and re-pads via `formatYearlySequence`; it does **not** accept sequences wider than 9 digits.
