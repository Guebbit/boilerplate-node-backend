---
source: src/infrastructure/persistence/report.ts
source_sha256: 541b6b602d03baa9303a1ac8afa0db37966638dcce2c5240af1207fe801085dc
context_sha256: 271a94c753d1167df460f6cd14e848d71184cedbf9fc47be1451afde21569936
generated_at: 2026-11-22T03:03:49.944889+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/persistence/report.ts

## Purpose
Holds the shared building blocks for grouped (time-bucketed) reads behind the stats. It defines a half-open date window with a bucket size and time zone, plus the MongoDB `$dateTrunc` expression that buckets a date field in that zone. It is not stats-specific: each owner module uses it for its own grouped read.

## Key elements
- `ReportInterval`: union type `'day' | 'week' | 'month'`, the allowed bucket sizes.
- `ReportWindow`: interface describing what a grouped read is asked about:
  - `from`: first instant included.
  - `to`: first instant excluded.
  - `interval`: the bucket size.
  - `timeZone`: IANA zone; a bucket starts at local midnight there.
- `bucketOf(field, window)`: returns a `$dateTrunc` expression (`date`, `unit` = interval, `timezone`) for the given date field (passed with its `$`).

## Relationships
- Graph neighbors on the repository side: `src/modules/invoicing/repository.ts`, `src/modules/payments/repository.ts` and `src/modules/returns/repository.ts`.
- Graph neighbors on the stats-service side: `src/modules/invoicing/services/stats.ts`, `src/modules/orders/services/stats.ts`, `src/modules/payments/services/stats.ts` and `src/modules/returns/services/stats.ts`.
- `src/modules/stats/services/range.ts` is a graph neighbor. This file does not show how the two interact.
- Covered by `tests/unit/infrastructure/persistence/report.test.ts`.
- Money is read by `toMinorUnits` from `@domain-primitives/money`, which is referenced in the module doc but not imported here.

## Notes
- `startOfWeek: 'monday'` is only included when `interval === 'week'`, because it only applies to weeks.
- Money is stored as Decimal128, so a plain `$sum` is exact. The result is read once, as minor units per currency, by `toMinorUnits`.
- The window is half-open: `from` is inclusive and `to` is exclusive.
