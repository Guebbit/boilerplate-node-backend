---
source: src/modules/products/tests/unit/preorder.test.ts
sha256: 7011ab22bef7545d540c955b02ca5f9c74f18e64e12313d2ebcaea586e32a303
generated_at: 2026-10-15T11:49:53.891059+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/tests/unit/preorder.test.ts

## Purpose

Unit tests for the two pure date/product helpers in the products domain (`isPreorder`, `latestReleaseDate`). All cases run against a fixed clock (`NOW = 2026-10-12T10:00:00Z`) so results are deterministic and independent of wall-clock time.

## Key elements

- **`NOW`, `LATER`, `EARLIER`** – module-level `Date` constants used as fixed references for every assertion.
- **`describe('isPreorder')`** – table-driven test (`it.each`) covering seven scenarios: future date on a visible/buyable product, explicit `active`/`purchasable` flags, missing date, past date, date exactly now, hidden product (`active: false`), and off-sale product (`purchasable: false`). Each case passes a partial product object plus the fixed `NOW` to `isPreorder` and asserts the boolean result.
- **`describe('latestReleaseDate')`** – two focused tests: (1) the returned instant is exactly one calendar year after the input; (2) the input `Date` object is not mutated (checked via `getTime()` before/after).

## Relationships

- **`src/modules/products/domain/preorder.ts`** (imported) – provides `isPreorder` and `latestReleaseDate`, the two functions under test. This file is a pure consumer; it exports nothing and has no other dependencies.

## Notes

- The test never calls `new Date()` at runtime (aside from the constants), so it is safe to run in any environment and cannot flake due to time drift.
- `isPreorder` is exercised with *partial* objects (e.g. `{ releaseDate: LATER }`) rather than full product entities, confirming the function only reads the specific fields it needs.
- The "exactly now" boundary is treated as **not** a preorder (`false`), which pins the implementation to a strict `>` comparison.
- `latestReleaseDate` is verified to return a *new* `Date` (non-mutation), a contract that callers may rely on.
