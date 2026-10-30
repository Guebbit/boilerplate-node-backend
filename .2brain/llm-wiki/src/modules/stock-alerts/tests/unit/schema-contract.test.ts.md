---
source: src/modules/stock-alerts/tests/unit/schema-contract.test.ts
sha256: e56a07e3d9e9cbfc0c55eb1029e2b99f3beda2d069bb35918c4b159435763846
generated_at: 2026-10-29T06:00:17.647432+00:00
model: ollama:qwen3.8:27b
---

# src/modules/stock-alerts/tests/unit/schema-contract.test.ts

## Purpose

Unit test that locks down the **declarations** (not runtime documents) of `stockAlertSchema`. It asserts the schema's required fields, reference targets, exact index set (including the `userId`+`productId` unique index that makes a repeated request a no-op at the database level), and the `timestamps` option—so that a silently dropped `unique` or an accidental extra index is caught immediately.

## Key elements

- **`describe('stockAlertSchema', …)`** — single suite with five `it` blocks, each pinning one aspect of the schema contract.
  - *Required paths* — asserts `requiredPaths` returns exactly `['productId', 'userId']` and nothing more.
  - *Reference targets* — asserts `refOf` maps `userId → 'User'` and `productId → 'Product'`.
  - *Unique composite index* — asserts `indexOptionSpecs` includes `'userId_1_productId_1: unique=true'`.
  - *Full index list* — asserts `indexSpecs` equals exactly two entries (the per-product lookup and the composite unique), catching any stray index.
  - *Timestamps* — asserts `optionsOf(…).timestamps` is `true`.
- **Assertion helpers** (`requiredPaths`, `refOf`, `indexOptionSpecs`, `indexSpecs`, `optionsOf`) — imported from `@tests/schema`; they serialize Mongoose schema internals into plain strings/arrays so tests read as English contracts rather than raw Mongoose objects.

## Relationships

- **`src/modules/stock-alerts/model.ts`** — source of `stockAlertSchema`, the sole subject under test.
- **`tests/support/schema.ts`** — provides all five helper functions used to extract and stringify schema metadata for assertions.

## Notes

- The test asserts **exact** index lists (`toEqual` on the full array), not just membership. Adding a new index to the model without updating this test will fail the suite by design.
- The module doc comment calls out *why* the unique index is tested here rather than via an integration/factorion test: a dropped `unique` constraint is invisible to a fixture that only writes valid (non-duplicate) documents.
- No `beforeEach`, no mocks, no database connection—purely a shape check on the in-memory Mongoose schema object.
