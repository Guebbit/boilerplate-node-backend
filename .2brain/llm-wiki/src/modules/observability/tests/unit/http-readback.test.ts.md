---
source: src/modules/observability/tests/unit/http-readback.test.ts
sha256: 3488ddcec62cb71ab469ddb4b547d8a69d708b70a1a2c33f28ea5a3b40bcddb9
generated_at: 2026-09-23T18:58:17.599872+00:00
model: ollama:qwen3.8:27b
---

# src/modules/observability/tests/unit/http-readback.test.ts

## Purpose

Unit tests for the `percentileFromHistogramBuckets` helper, verifying that it correctly maps a target percentile to an upper-bound value from a list of histogram buckets.

## Key elements

- **`describe('percentileFromHistogramBuckets')`** — Jest suite containing two cases.
- **`it('returns 0 for empty histograms')`** — asserts the function returns `0` when the bucket array is empty.
- **`it('picks first bucket whose cumulative count reaches percentile threshold')`** — feeds a 3-bucket histogram (upperBounds 10/25/50, cumulativeCounts 2/5/9) with a total of 10 and checks that p50 → 25 and p95 → 50.

## Relationships

- **`src/modules/observability/http-readback.ts`** — the module under test; this file imports `percentileFromHistogramBuckets` from it. No other neighbors are referenced.

## Notes

- The p95 case (threshold = 9.5) exceeds every bucket's cumulative count (max 9), yet the expected result is the *last* bucket's upperBound (50). This implies the implementation falls back to the final bucket when no bucket reaches the threshold — a behavior that is only visible from the test expectation, not documented in the function signature.
- The second argument to the function (10) is the total observation count, not the sum of cumulative counts, so callers must supply it explicitly.
