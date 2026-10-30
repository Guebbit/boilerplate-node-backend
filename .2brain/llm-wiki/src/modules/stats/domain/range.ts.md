---
source: src/modules/stats/domain/range.ts
sha256: fb8dcef344740868f397e8f2f8646d31b324249918c772f03c5ccf28e674e0f4
generated_at: 2026-10-29T05:55:20.748630+00:00
model: ollama:qwen3.8:27b
---

# src/modules/stats/domain/range.ts

## Purpose
Pure domain rules that validate a requested reporting period (two calendar days + a bucket interval) and compute the bucket boundaries it touches. Exists to keep "what is a legal range" logic free of I/O, framework, or timezone concerns so it is trivially testable and reusable.

## Key elements
- **`MAX_RANGE_DAYS`** (731) / **`MAX_BUCKETS`** (400) — hard ceilings on period length and resolution.
- **`RangeRefusal`** — discriminated union (`'invalid-day' | 'out-of-order' | 'too-long' | 'too-many-buckets'`) naming the specific rule a request violated.
- **`CalendarRange`** — the validated output: `from`, `to`, `interval`, and `bucketStarts` (the first day of every bucket the period spans; the first entry may be *before* `from`).
- **`bucketStartsBetween(from, to, interval)`** — walks from the bucket containing `from` to `to`, collecting each bucket's first day via `nextBucket`.
- **`checkRange({ from, to, interval })`** — single entry point: parses the two `YYYY-MM-DD` strings, applies the four rules in order, and returns either `{ range }` or `{ refusal }`.
- **`previousOf(range)`** — returns the equal-length window ending the day before `range.from`, for period-over-period comparisons.

## Relationships
- **`./calendar`** — sole logic dependency; supplies `addDays`, `bucketStart`, `inclusiveDays`, `nextBucket`, `parseDay`, and the `CalendarDay` type used throughout.
- **`@types`** (`src/types/index.ts`) — imports the `StatsInterval` union type that parameterises every function.
- **`domain/index.ts`** — barrel re-export; consumers of the stats domain import from this file rather than the module path directly.
- **`services/range.ts`** — service-layer caller that receives user input and delegates validation to `checkRange` / `previousOf`.
- **`tests/unit/range.test.ts`** — unit tests exercising each exported function and the refusal paths.

## Notes
- The file is intentionally side-effect-free ("Pure") — no `new Date()`, no locale, no environment reads. All date math goes through `calendar.ts` helpers operating on a `CalendarDay` value type.
- `checkRange` performs its checks in a fixed order (parse → order → length → bucket count) and short-circuits on the first failure; the refusal string identifies *which* rule fired, not that a later rule might also have failed.
- `bucketStarts` may contain a day earlier than `range.from` (the bucket that `from` falls inside). Consumers must not assume `bucketStarts[0] >= from`.
- `MAX_RANGE_DAYS = 731` (not 730) to accommodate a two-year span that includes a leap day.
