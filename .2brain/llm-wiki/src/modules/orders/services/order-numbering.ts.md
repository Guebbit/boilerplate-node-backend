---
source: src/modules/orders/services/order-numbering.ts
source_sha256: fe9458e8ba138fee3b84c7b0b24dd76a39a988318e2fa4212445ccbb5df04dcf
context_sha256: 5a7d25ed5aac1f156c7b27873c6b4030bddafbcd1eb71bd0a4103088181d1c83
generated_at: 2026-11-22T06:21:32.449006+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/orders/services/order-numbering.ts

## Purpose
Turns the repository's atomic yearly counter into the order number format `{year}-{sequence}` (e.g. `2026-000041`). It only decides the string; atomicity lives behind the repository. The number identifies a receipt, not a tax invoice.

## Key elements
- `allocateOrderNumber(): Promise<string>`: gets the current year in the shop's timezone (`shopTimezone()`), increments that year's counter via the repository, and formats the result with `formatYearlySequence`. Marked `@internal`.
- `parseOrderNumber(raw): string | undefined`: tolerant inverse of the format. It trims whitespace, strips a leading `#`, and accepts `{4-digit year}-{1–9 digit sequence}`. It returns the canonical zero-padded number, or `undefined` if the input doesn't match.
- `QUOTED_ORDER_NUMBER` (private regex): `^(\d{4})-(\d{1,9})$`. The nine-digit cap is well past what the six-wide sequence reaches and stays exactly representable as a `Number`.

## Relationships
- `src/infrastructure/persistence/yearly-counter.ts`: supplies `formatYearlySequence`, used by both exports to build the padded number.
- `src/domain-primitives/time.ts`: supplies `yearInZone`, which computes the year for the shop's timezone.
- `src/modules/orders/repository.ts`: supplies `orderRepository`, whose `incrementOrderNumberCounter(year)` returns the next sequence.
- `src/modules/shop/index.ts`: supplies `shopTimezone()`, which reads the shop's timezone (`NODE_SHOP_TIMEZONE`).
- `src/modules/orders/services/place.ts`: `allocateOrderNumber` is described as the counter step beneath `placeOrder`.
- `src/modules/orders/tests/unit/order-number.test.ts` and `src/modules/orders/tests/integration/order-numbering.test.ts`: tests for this file.

## Notes
- `allocateOrderNumber` is called once per order, at creation. The caller stores the result on `Order.orderNumber`, so a re-downloaded receipt shows the same number.
- If the order write fails after allocation, the number is not reused and no rollback is attempted. The file documents this gap as acceptable, not a bug.
- The year comes from the shop's calendar timezone, not the server's.
- `allocateOrderNumber` is unpublished so siblings can't burn numbers by calling it directly.
