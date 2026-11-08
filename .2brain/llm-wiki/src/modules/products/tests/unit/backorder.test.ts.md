---
source: src/modules/products/tests/unit/backorder.test.ts
sha256: 6784e7db2360e1a79fac9607d998bc746244f2752e814085763e2ba729c4cdb8
generated_at: 2026-11-08T07:53:31.913591+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/tests/unit/backorder.test.ts

## Purpose

Unit tests for the `isBackorder` domain function. Because the function is pure (it receives the current time as a parameter rather than calling `Date.now()`), every test case runs against a fixed clock, making assertions deterministic without mocking.

## Key elements

- **`NOW`, `LATER`, `EARLIER`** — Fixed `Date` constants used as the "current time" and as restock/release date fixtures.
- **`ON`** — Baseline product fact object representing the "backorder switch is on, within cap" state.
- **`describe('isBackorder')` / `it.each(...)`** — A single table-driven test block that exercises 14 scenarios: switch on/off/unset, cap present/null/zero/full, restock date ahead/passed/exact-now, hidden/off-sale products, and preorder-vs-backorder distinction. Each row supplies a partial fact object and the expected boolean result.

## Relationships

- **`src/modules/products/domain/backorder.ts`** — The sole import. This file calls `isBackorder(facts, NOW)` and asserts on the returned boolean. No other modules are touched.

## Notes

- The function signature is `isBackorder(facts, now: Date)` — callers must pass the clock explicitly; there is no hidden `Date.now()` call inside the domain function.
- "Absent reads closed" convention: a missing `allowBackorder` field or a missing `backorderLimit` field both cause the function to return `false`, as asserted by the "switch never set" and "cap never opened" cases.
- A `restockDate` exactly equal to `NOW` is treated as *passed* (sold out → `false`), not as still available.
- A `releaseDate` in the future disqualifies a product from backorder (it is a preorder instead), even if every other backorder condition is met.
