---
source: src/modules/stats/domain/range.ts
sha256: fb8dcef344740868f397e8f2f8646d31b324249918c772f03c5ccf28e674e0f4
generated_at: 2026-11-08T08:24:28.798297+00:00
model: ollama:qwen3.8:27b
---

# src/modules/stats/domain/range.ts

## Purpose

Pure domain logic that validates a user-requested date range (two `YYYY-MM-DD` strings plus a bucket interval) against fixed rules and, on success, computes the calendar-day bucket boundaries the report will use. It also derives the immediately preceding period of equal length for comparison queries. All arithmetic is in calendar days, so it is timezone-independent.

## Key elements

- **`MAX_RANGE_DAYS`** (731) — upper bound on the span of a single request (≈ 2 years).
- **`MAX_BUCKETS`** (400) — upper bound on the number of bucket start days a request may produce.
- **`RangeRefusal`** — union type (`'invalid-day' | 'out-of-order' | 'too-long' | 'too-many-buckets'`) identifying why a request was rejected.
- **`CalendarRange`** — the validated result: `from`, `to`, `interval`, and the pre-computed `bucketStarts` array.
- **`bucketStartsBetween(from, to, interval)`** — walks from the bucket containing `from` forward until past `to`, collecting every bucket start day. The first entry may fall before `from`.
- **`checkRange({from, to, interval})`** — entry point. Parses the two date strings, then checks in order: valid dates → `from ≤ to` → span ≤ `MAX_RANGE_DAYS` → bucket count ≤ `MAX_BUCKETS`. Returns `{ range }` or `{ refusal }`.
- **`previousOf(range)`** — returns the `{from, to}` pair of the same length ending the day before `range.from`. Does **not** include `interval` or `bucketStarts`.

## Relationships

- **`src/modules/stats/domain/calendar.ts`** — provides all the calendar primitives this module composes: `parseDay`, `addDays`, `inclusiveDays`, `bucketStart`, `nextBucket`, and the `CalendarDay` type.
- **`src/types/index.ts`** — source of the `StatsInterval` type used in signatures throughout this file.
- **`src/modules/stats/domain/index.ts`** — barrel re-export; makes this module's API available to the rest of the stats domain.
- **`src/modules/stats/services/range.ts`** — service layer that calls `checkRange` / `previousOf` and orchestrates the report-fetching flow around the validated range.
- **`src/modules/stats/tests/unit/range.test.ts`** — unit tests covering the validation rules and bucket-start computation.

## Notes

- `bucketStarts` in `CalendarRange` may contain a day **before** `range.from` (the bucket boundary that contains `from`). Consumers must not assume `bucketStarts[0] === from`.
- `previousOf` intentionally returns a bare `{from, to}` pair rather than a full `CalendarRange`; callers that need buckets must re-run `bucketStartsBetween` or pass the pair back through `checkRange`.
- Validation is short-circuit and ordered: the refusal reason reflects the *first* rule that fails, not all violations.
