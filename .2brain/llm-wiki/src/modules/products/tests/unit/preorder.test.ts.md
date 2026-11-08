---
source: src/modules/products/tests/unit/preorder.test.ts
sha256: 7011ab22bef7545d540c955b02ca5f9c74f18e64e12313d2ebcaea586e32a303
generated_at: 2026-11-08T07:54:08.933845+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/tests/unit/preorder.test.ts

## Purpose

Unit tests for the two pure functions exported by the products domain (`isPreorder`, `latestReleaseDate`). Every case runs against a fixed, hardcoded clock so the suite is deterministic and free from `Date.now()` drift.

## Key elements

- **Fixed date constants** (`NOW`, `LATER`, `EARLIER`) — pre-built `Date` objects used as the reference instant and as product release dates in test fixtures.
- **`describe('isPreorder')`** — table-driven (`it.each`) suite with seven cases covering: future release date, explicit `active`/`purchasable` flags, missing date, past date, date exactly equal to `NOW`, hidden (`active: false`) product, and off-sale (`purchasable: false`) product. Calls `isPreorder(facts, NOW)` and asserts the boolean result.
- **`describe('latestReleaseDate')`** — two assertions: (1) the returned date is exactly one calendar year after the input; (2) the input `Date` is not mutated (`.getTime()` unchanged after the call).

## Relationships

- **`src/modules/products/domain/preorder.ts`** — the sole import source. This file exercises `isPreorder` (two-arg: facts object + reference date) and `latestReleaseDate` (one-arg: a `Date`). No other modules are referenced.

## Notes

- `isPreorder` expects a **second argument** (the reference "now") rather than reading the system clock, which is what makes the fixed-date approach in this test possible.
- The `NOW` boundary case (`releaseDate` exactly equal to `NOW`) is expected to return `false`, i.e. the comparison is strict-greater-than, not `>=`.
- `latestReleaseDate` is asserted to be **pure** (no mutation of its argument), so callers can safely pass shared `Date` instances.
