---
source: tests/unit/domain-primitives/end-of-utc-day.test.ts
sha256: d681fc3b5990250d3fc3fd63c4acfce977d3566b56e7d7aa859aa7eb1f7f3275
generated_at: 2026-11-08T10:03:40.027349+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/domain-primitives/end-of-utc-day.test.ts

## Purpose

Unit tests for the `endOfUtcDay` primitive, verifying that any UTC instant on a given date maps to that date's final millisecond (`23:59:59.999Z`). The file exists to pin down the boundary semantics: inputs just after midnight, at midday, and at the last tick must all converge to the same closing instant, including across month and year rollovers.

## Key elements

- **`describe('endOfUtcDay')`** — single test suite covering the function's contract.
- **`it.each([...])('closes the 5th at its last millisecond, from %s', …)`** — parameterized cases (`00:00:00.000Z`, `12:00:00.000Z`, `23:59:59.999Z`) all asserting the identical `2026-03-05T23:59:59.999Z` output.
- **`it('rolls over a month and a year end')`** — two assertions: Dec 31 → end of Dec 31; and Feb 29 in a leap year (2028) → end of Feb 29. Guards against off-by-one month-length bugs.

## Relationships

- **`src/domain-primitives/time.ts`** — sole dependency. Provides the `endOfUtcDay` function under test (imported as `@domain-primitives/time`).

## Notes

- The function is expected to return a `Date` object (tests call `.toISOString()` on the result).
- The leap-year case (`2028-02-29`) is deliberate: it ensures the implementation correctly resolves February in a 29-day year rather than defaulting to 28.
- All comparisons are against the literal string `'…T23:59:59.999Z'`, making the tests timezone-agnostic (UTC-only).
