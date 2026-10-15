---
source: src/modules/stats/domain/range.ts
sha256: 777ea5971d68a1035ae9d8f54bc2f8f3f4e2c89de43aba21d318504b73a4cef2
generated_at: 2026-10-15T12:03:21.156872+00:00
model: ollama:qwen3.8:27b
---

# src/modules/stats/domain/range.ts

## Purpose

Defines the validation rules and core domain logic for time-range requests in stats reports. It is pure (no I/O) and works exclusively in calendar days, so the rules are identical regardless of the requester's time zone.

## Key elements

- **`MAX_RANGE_DAYS` (731)** — upper bound on the inclusive day count a single request may span.
- **`MAX_BUCKETS` (400)** — upper bound on the number of bucket-starts a request may produce; rejects e.g. a day-by-day chart over two years.
- **`RangeRefusal`** — discriminated-union literal type (`'invalid-day' | 'out-of-order' | 'too-long' | 'too-many-buckets'`) explaining why a period was rejected.
- **`CalendarRange`** — validated period carrying `from`, `to`, `interval`, and the precomputed `bucketStarts` array.
- **`bucketStartsBetween(from, to, interval)`** — walks from the bucket that contains `from` forward by `interval` steps, collecting the first day of every bucket up to and including the one that contains `to`.
- **`checkRange({ from, to, interval })`** — entry-point validator; parses day strings, enforces order, length, and bucket-count limits; returns either `{ range }` or `{ refusal }`.
- **`previousOf(range)`** — returns the equal-length period that ends the day before `range.from` (useful for "compare to previous period" features).

## Relationships

- **`src/modules/stats/domain/calendar.ts`** — supplies all calendar primitives this file imports (`addDays`, `bucketStart`, `inclusiveDays`, `nextBucket`, `parseDay`) and the `CalendarDay` / `CalendarInterval` types. `range.ts` contains no calendar arithmetic of its own.
- **`src/modules/stats/domain/index.ts`** — barrel re-export; consumers import the public names from the domain index rather than this file directly.
- **`src/modules/stats/services/range.ts`** — service-layer caller; wraps `checkRange` / `previousOf` with I/O (fetching data, building responses) around the pure domain logic defined here.
- **`src/modules/stats/tests/unit/range.test.ts`** — unit tests that exercise `checkRange`, `bucketStartsBetween`, and `previousOf` against known boundary conditions.

## Notes

- `bucketStarts` in a `CalendarRange` may contain a start day **earlier** than `from` (the bucket that `from` falls inside). Downstream consumers must not assume `bucketStarts[0] >= from`.
- `checkRange` is intentionally a pure function returning a discriminated union; callers branch on `'range' in result` vs `'refusal' in result`. There is no exception path.
- `MAX_RANGE_DAYS` is 731 (not 730), a hard ceiling slightly above two calendar years to keep the constant simple while still rejecting obviously absurd ranges.
- All date math is delegated to `calendar.ts`; this file adds no arithmetic beyond the bucket-starts loop, making it safe to reason about in isolation.
