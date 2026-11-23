---
source: src/modules/observability/tests/unit/http-readback.test.ts
source_sha256: 3488ddcec62cb71ab469ddb4b547d8a69d708b70a1a2c33f28ea5a3b40bcddb9
context_sha256: ec83bb7ba2322d733a11f1ed406ca59e30eaf9f562a14f8df4fb5d9494135e7c
generated_at: 2026-11-22T06:05:13.391908+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/observability/tests/unit/http-readback.test.ts

## Purpose
Unit tests for `percentileFromHistogramBuckets`, the helper in `http-readback.ts` that derives a percentile value from cumulative histogram buckets.

## Key elements
- `describe('percentileFromHistogramBuckets')`: the only test suite, with two cases.
- **Empty histogram case**: `percentileFromHistogramBuckets([], 0, 0.95)` returns `0`.
- **Threshold case**: uses buckets `{upperBound, cumulativeCount}` = `(10, 2)`, `(25, 5)`, `(50, 9)` with a total of `10`.
  - Percentile `0.5` returns `25`.
  - Percentile `0.95` returns `50`.
  - The test name says the function picks the first bucket whose cumulative count reaches the percentile threshold.

## Relationships
- Imports `percentileFromHistogramBuckets` from `../../http-readback` (`src/modules/observability/http-readback.ts`), the only module under test.
- The call signature seen here is `(buckets, totalCount, percentile)`. Buckets are objects with `upperBound` and `cumulativeCount`.

## Notes
- `describe`, `it` and `expect` are used without imports, so they come from a global test runner such as Jest.
- The 0.95 case works out as follows. The threshold of 9.5 exceeds the largest cumulative count of 9, yet the result is `50`, the last bucket's upper bound. This suggests the function falls back to the last bucket, but the test does not state this explicitly.
