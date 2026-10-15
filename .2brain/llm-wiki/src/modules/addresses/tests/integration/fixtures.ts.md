---
source: src/modules/addresses/tests/integration/fixtures.ts
sha256: 98792d3a304d5beb524735bc2cdd2371b620f0ef4150adacfac08cdbfb286ada
generated_at: 2026-10-15T10:19:19.710950+00:00
model: ollama:qwen3.8:27b
---

# src/modules/addresses/tests/integration/fixtures.ts

## Purpose

Shared address fixtures for the addresses integration test suites. Exports two canned address objects so that `addresses.test.ts` and `checkout.test.ts` can reference identical, stable data without duplicating literals inline.

## Key elements

- **`HOME`** — A const object representing a home address (label `home`, street `Via Roma 1`, Modena 41121, IT).
- **`OFFICE`** — A const object representing a second address (label `office`, street `Via Milano 2`, Modena 41122, IT).

Both objects carry the same `fullName` (`Ada Lovelace`), `city` (`Modena`), and `country` (`IT`); they differ only in `label`, `street`, and `zip`.

## Relationships

- **`src/modules/addresses/tests/integration/addresses.test.ts`** — Imports `HOME` and/or `OFFICE` as the address payloads it writes and asserts on.
- **`src/modules/addresses/tests/integration/checkout.test.ts`** — Imports the same fixtures to drive checkout-scenario assertions.

## Notes

- The two fixtures are deliberately minimal: they differ in exactly three fields (`label`, `street`, `zip`) so tests can distinguish them while keeping the "same person, same town" setup realistic.
- Values are hardcoded Italian addresses; they are **not** generated randomly. Any test that asserts on a specific street, zip, or label is coupled to these literals.
