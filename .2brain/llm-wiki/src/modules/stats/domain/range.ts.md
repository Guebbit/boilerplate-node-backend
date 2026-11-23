---
source: src/modules/stats/domain/range.ts
source_sha256: fb8dcef344740868f397e8f2f8646d31b324249918c772f03c5ccf28e674e0f4
context_sha256: 156fd22ce7d9796743b5ad3a474db782b8a3009e9cbfb528b27876bb529f1c6a
generated_at: 2026-11-22T07:51:03.087358+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/stats/domain/range.ts

## Purpose
Defines which reporting periods a stats request may ask for. It is pure: bounds are counted in calendar days, so the rules behave the same in every time zone. It validates a `from`/`to` pair plus a bucket interval and expands it into the list of buckets the period touches.

## Key elements
- `MAX_RANGE_DAYS` (731): longest period one request may cover (about two years).
- `MAX_BUCKETS` (400): most buckets one request may return. It refuses, for example, a day-by-day chart over two years.
- `RangeRefusal`: union `'invalid-day' | 'out-of-order' | 'too-long' | 'too-many-buckets'`.
- `CalendarRange`: an accepted period with `from`, `to`, `interval` and `bucketStarts`. The first bucket start may fall before `from`.
- `bucketStartsBetween(from, to, interval)`: starts at the bucket containing `from` and steps with `nextBucket` while the cursor is still within `to`. It returns each bucket's first day.
- `checkRange({ from, to, interval })`: parses the `YYYY-MM-DD` strings and returns `{ range }` or `{ refusal }`. Checks run in this order:
  1. Either day fails to parse: `invalid-day`.
  2. Fewer than 1 inclusive day: `out-of-order`.
  3. More than `MAX_RANGE_DAYS`: `too-long`.
  4. More than `MAX_BUCKETS` buckets: `too-many-buckets`.
- `previousOf(range)`: returns the period of equal length that ends the day before `range.from`. Used for comparison periods.

## Relationships
- Imports the day arithmetic and parsing helpers from `./calendar` (`addDays`, `bucketStart`, `inclusiveDays`, `nextBucket`, `parseDay`, and the `CalendarDay` type). It does no date math of its own.
- Imports the `StatsInterval` type from `@types` (`src/types/index.ts`).
- Part of the stats domain layer. `src/modules/stats/domain/index.ts` is its neighbor in the same layer.
- `src/modules/stats/services/range.ts` is a neighbor in the service layer. The domain file is pure, so the service layer presumably adds the non-pure parts.
- `src/modules/stats/tests/unit/range.test.ts` holds the unit tests for this file.

## Notes
- `checkRange` returns a discriminated result rather than throwing. Callers must test for `range` or `refusal`.
- The bucket-count check runs only after the day-length check passes. `bucketStartsBetween` is therefore only ever called on a period of at most 731 days.
- Because bucket starts are aligned to the interval, a period can produce one more bucket than its length alone suggests.
