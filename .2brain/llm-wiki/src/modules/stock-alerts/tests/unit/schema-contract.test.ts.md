---
source: src/modules/stock-alerts/tests/unit/schema-contract.test.ts
sha256: e56a07e3d9e9cbfc0c55eb1029e2b99f3beda2d069bb35918c4b159435763846
generated_at: 2026-11-08T08:30:42.465413+00:00
model: ollama:qwen3.8:27b
---

# src/modules/stock-alerts/tests/unit/schema-contract.test.ts

## Purpose

Unit test that verifies the **structural declarations** of `stockAlertSchema` (required paths, references, index specs, options) rather than document contents. It exists because constraints like a dropped `unique` flag on the compound index are invisible to fixture-based document tests: the pair still exists as data, it just loses its uniqueness guarantee.

## Key elements

- **`describe('stockAlertSchema')`** — single test suite with five assertions:
  - `requiredPaths` → exactly `['productId', 'userId']` (no extras).
  - `refOf` → `userId` references the `User` collection, `productId` references `Product`.
  - `indexOptionSpecs` → the compound index `userId_1_productId_1` is marked `unique=true`.
  - `indexSpecs` → exactly two indexes: single-field `productId_1` and the compound `userId_1_productId_1`; no others.
  - `optionsOf(...).timestamps` → `true`.

## Relationships

- **`src/modules/stock-alerts/model.ts`** — provides `stockAlertSchema`, the sole subject under test.
- **`tests/support/schema.ts`** — provides the schema-inspection helpers used by every assertion: `requiredPaths`, `refOf`, `indexSpecs`, `indexOptionSpecs`, `optionsOf`.

## Notes

- Assertions use **exact-set equality** (`toEqual`) or **membership** (`toContain`) intentionally. The "and nothing else" phrasing in test names signals that the suite guards against *accidental* additions (extra indexes, extra required fields), not just the presence of expected ones.
- The module docstring draws a deliberate line between "schema contract" (this file) and "document validation" (handled elsewhere). Do not add document-shape assertions here; that would blur the separation and weaken the unique-index guarantee this file exists to protect.
