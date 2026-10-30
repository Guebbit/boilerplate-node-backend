---
source: src/modules/orders/domain/shop-time.ts
sha256: 043da73c8776840668b51189dfed555bdf4791e64eb97171397351c8d7d42dbd
generated_at: 2026-10-29T04:40:36.567549+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/domain/shop-time.ts

## Purpose

Provides a single pure helper, `yearInZone`, that resolves the calendar year of an instant in a shop's IANA time zone. It exists so that number series (order numbers, invoice numbers) are assigned to the year the shop sees on its wall clock, not the UTC year the server happens to be in around the year boundary.

## Key elements

- **`yearInZone(instant: Date, timeZone: string): number`** — Returns the four-digit Gregorian year of `instant` as seen in `timeZone`. Implemented via `Intl.DateTimeFormat('en', { timeZone, year: 'numeric', calendar: 'gregory' })` and `formatToParts`, then extracts the `year` part. No external state; the zone is always passed in.

## Relationships

- **`src/modules/orders/domain/index.ts`** — Barrel that re-exports `yearInZone` so consumers can import from the domain package root.
- **`src/modules/orders/services/order-numbering.ts`** — Consumes `yearInZone` to compute the year segment of an order number.
- **`src/modules/invoicing/services/numbering.ts`** — Consumes `yearInZone` to compute the year segment of invoice / credit-note numbers.
- **`src/modules/orders/tests/unit/shop-time.test.ts`** — Unit tests for `yearInZone` (no environment needed because the zone is an argument).
- **`src/modules/orders/tests/integration/order-numbering.test.ts`** — Integration tests that exercise order numbering, indirectly exercising `yearInZone`.
- **`src/modules/invoicing/tests/integration/issue-invoice.test.ts`** / **`issue-credit-note.test.ts`** — Integration tests that validate invoice numbering, indirectly exercising `yearInZone`.

## Notes

- The locale is hard-coded to `'en'` with `year: 'numeric'` to guarantee a bare Gregorian integer regardless of host locale. Do not "localise" this without re-evaluating downstream parsing.
- The module docstring explicitly delegates day-level zone maths to `@domain-primitives/time`; this file only extracts the *year*.
- Because the function is pure (zone is a parameter, no `process.env.TZ`), the unit suite runs in any environment without stubbing.
