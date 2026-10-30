---
source: src/modules/products/tests/unit/backorder.test.ts
sha256: 6784e7db2360e1a79fac9607d998bc746244f2752e814085763e2ba729c4cdb8
generated_at: 2026-10-29T05:34:30.284268+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/tests/unit/backorder.test.ts

## Purpose

Unit-test suite for the `isBackorder` domain function. Because the function is pure (it accepts the current time as a parameter), every assertion runs against a fixed clock, making the tests deterministic and free of `Date.now()` mocking.

## Key elements

- **`NOW`, `LATER`, `EARLIER`** — Three fixed `Date` constants used to simulate "now", a future restock/release, and a past date.
- **`ON`** — A shared config object (`allowBackorder: true`, `backorderLimit: 5`, `backordered: 2`) representing a backorder-enabled product with available capacity. Individual cases spread it and override fields.
- **`describe('isBackorder')` → `it.each([...])`** — A single table-driven block of 14 cases covering: switch on/off, `null` vs. absent vs. zero vs. full cap, restock date ahead / passed / exactly-now, hidden product (`active: false`), off-sale (`purchasable: false`), and the preorder-vs-backorder distinction via `releaseDate`. Each case passes a `facts` object and the expected boolean, then calls `isBackorder(facts, NOW)`.

## Relationships

- **`src/modules/products/domain/backorder.ts`** — Provides the single SUT: `isBackorder(facts, now)`. This test file is its only consumer in the unit-test layer.

## Notes

- **Boundary semantics are explicit in the table.** A restock date exactly equal to `NOW` is treated as *already passed* (sold out), meaning the domain uses a strict `>` comparison. A `releaseDate` in the future flips the product into "preorder" territory, which is *not* a backorder.
- **Absent ≠ zero.** The case labelled *"a cap that was never opened (absent reads closed)"* passes `allowBackorder: true` with no `backorderLimit` key and expects `false`, confirming the domain treats a missing cap as closed rather than unlimited. Only an explicit `null` means "no cap."
- **No external mocking needed.** The design contract (injecting `now`) keeps the test free of `jest.useFakeTimers` or similar, at the cost of the caller always having to supply a date in production.
