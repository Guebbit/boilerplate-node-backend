---
source: src/modules/observability/tests/unit/http-readback.test.ts
sha256: 3488ddcec62cb71ab469ddb4b547d8a69d708b70a1a2c33f28ea5a3b40bcddb9
generated_at: 2026-11-08T06:43:10.025058+00:00
model: ollama:qwen3.8:27b
---

# src/modules/observability/tests/unit/http-readback.test.ts

## Purpose

Unit tests for the `percentileFromHistogramBuckets` utility exported from the observability module. Verifies that percentile estimation from histogram buckets behaves correctly for edge cases (empty input) and for selecting the appropriate bucket at various percentile thresholds.

## Key elements

- **`describe('percentileFromHistogramBuckets')`** — test suite scoped to the single function under test.
- **`it('returns 0 for empty histograms')`** — asserts the function returns `0` when passed an empty bucket array, a total count of `0`, and a `0.95` percentile.
- **`it('picks first bucket whose cumulative count reaches percentile threshold')`** — builds a 3-bucket histogram (upperBounds 10/25/50, cumulativeCounts 2/5/9, total count 10) and asserts the returned upperBound is `25` for the 50th percentile and `50` for the 95th percentile.

## Relationships

- **Imports from `src/modules/observability/http-readback.ts`** — the only dependency; the test file exercises `percentileFromHistogramBuckets` directly. No other symbols from that module are imported.

## Notes

- The test assumes a **linear-interpolation-free** contract: the function returns the `upperBound` of the first bucket whose `cumulativeCount` meets or exceeds `percentile × totalCount`, rather than interpolating between bucket boundaries.
- The second test hard-codes `totalCount = 10` (equal to the final bucket's `cumulativeCount`). If the implementation reads `totalCount` from a separate argument rather than deriving it from the last bucket, this is the coupling point to watch when refactoring.
- No mocking or async behavior; the test is fully synchronous.
