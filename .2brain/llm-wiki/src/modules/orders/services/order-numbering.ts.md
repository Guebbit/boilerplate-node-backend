---
source: src/modules/orders/services/order-numbering.ts
sha256: 6f90a01ed4a1e4533f1638a65739c79d302ad22058d81be7a70e3f847ba85c6d
generated_at: 2026-11-08T06:58:25.581866+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/services/order-numbering.ts

## Purpose

Formats the repository's atomic yearly counter into the order-number string `{year}-{sequence}` (e.g. `2026-000041`) and parses customer-typed input back into that canonical form. It owns **string shape only**; the atomic increment lives in the repository.

## Key elements

- **`allocateOrderNumber(): Promise<string>`** — Gets the current year in the shop's timezone, calls `orderRepository.incrementOrderNumberCounter(year)`, and returns the zero-padded `{year}-{sequence}` string. Annotated `@internal`; intended to be called exactly once per order at creation time.
- **`parseOrderNumber(raw: string): string | undefined`** — Trims whitespace, strips an optional leading `#`, validates against `QUOTED_ORDER_NUMBER` (`^\d{4}-\d{1,9}$`), and re-emits the canonical zero-padded form. Returns `undefined` if the input is not a valid order number.
- **`QUOTED_ORDER_NUMBER`** (module-private regex) — Accepts 4-digit year + 1-to-9-digit sequence. Nine digits is far past the 6-wide sequence but safely within `Number` exactness.

## Relationships

- **`@infrastructure/persistence/yearly-counter`** — provides `formatYearlySequence(year, seq)` which both exports use for the zero-padded output.
- **`@domain-primitives/time`** — provides `yearInZone(date, tz)` used to derive the year for allocation.
- **`../repository`** — provides `orderRepository.incrementOrderNumberCounter(year)`; the sole call site for the atomic increment.
- **`@modules/shop`** — provides `shopTimezone()` (reads `NODE_SHOP_TIMEZONE`) so the year boundary follows the shop's calendar, not UTC.
- **`services/place.ts`** — the expected caller of `allocateOrderNumber` at order-creation time (the doc-comment references "the counter step beneath `placeOrder`").
- **`services/read.ts`** — expected consumer of `parseOrderNumber` when a filter carries a customer-typed number.
- **`tests/unit/order-number.test.ts`** / **`tests/integration/order-numbering.test.ts`** — unit and integration coverage for both exports.

## Notes

- **Not an invoice number.** The module doc explicitly disambiguates from a tax invoice; see `docs/modules/orders.md` for the receipt-vs-invoice distinction.
- **Number gap on failed write is by design.** If `allocateOrderNumber` succeeds but the subsequent order insert fails, the consumed sequence number is never reused or rolled back. This mirrors Shopify's `#1001` behavior and is documented as acceptable.
- **Tolerant parse, strict format.** `parseOrderNumber` accepts `#2026-41`, ` 2026-000041 `, etc., and always normalises to the zero-padded form. The inverse (`allocateOrderNumber`) only ever produces the canonical shape.
- **`@internal` on `allocateOrderNumber`.** It is deliberately not part of the public module surface so sibling services cannot accidentally burn a sequence number.
