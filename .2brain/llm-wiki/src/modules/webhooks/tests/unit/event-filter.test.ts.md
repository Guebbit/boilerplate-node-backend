---
source: src/modules/webhooks/tests/unit/event-filter.test.ts
sha256: 215d0db70aa8916f4b459b65707778fb1829013d6a3ea98a16c2686f1659d7d1
generated_at: 2026-11-08T09:10:06.185110+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/tests/unit/event-filter.test.ts

## Purpose

Unit tests for the `matchesEventFilter` function, verifying that event-name matching against a filter array behaves correctly for exact matches, non-matches, the `ALL_EVENTS` wildcard, and the empty-filter edge case.

## Key elements

- **`describe('matchesEventFilter')`** — single test suite with four cases:
  - Exact name present in the filter array → `true`
  - Exact name absent from the filter array → `false`
  - `ALL_EVENTS` in the filter matches *any* event name → `true` (tested with two different names)
  - Empty filter array → `false`

## Relationships

- **`src/modules/webhooks/domain/index.ts`** — the barrel module; this test imports `matchesEventFilter` and `ALL_EVENTS` through it (`@modules/webhooks/domain`), exercising the public API surface rather than a deep path.
- **`src/modules/webhooks/domain/event-filter.ts`** — the module under test; provides both the `matchesEventFilter` function and the `ALL_EVENTS` sentinel value.

## Notes

- The test imports via the barrel (`@modules/webhooks/domain`) rather than the direct file path, so a broken re-export in `index.ts` would surface here.
- `ALL_EVENTS` is treated purely as a wildcard token; the test does not assert what its runtime value is, only that its *presence* in the array short-circuits matching to `true`.
