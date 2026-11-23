---
source: src/modules/products/tests/unit/backorder.test.ts
source_sha256: 1735ca49d5ec09fe4b12088b2aa3651b02f9a60a0f63bd006c19046ed6d1ebb9
context_sha256: 25ebc2014d67351531b95d0ea4bdc1cfa2a96ef8e73473e713cbc9d5220f13a4
generated_at: 2026-11-22T07:19:01.299786+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/products/tests/unit/backorder.test.ts

## Purpose
Unit tests for `isBackorder` from the products domain. The function is pure, so the tests pin the clock to a fixed instant (`NOW`, 2026-10-12T10:00:00Z) and exercise each edge of the backorder rule.

## Key elements
- `NOW`, `LATER`, `EARLIER`: fixed dates. `NOW` is the judgement instant; `LATER` is after it and `EARLIER` is before it.
- `ON`: base facts, `{ allowBackorder: true }`.
- `describe('isBackorder')` with an `it.each` table that calls `isBackorder(facts, NOW)` and checks the boolean result:
  - **True:** switch on; `restockDate` in the future; `releaseDate` in the past.
  - **False:**
    - `restockDate` in the past, or exactly `NOW` (so the restock boundary is exclusive).
    - `allowBackorder` false, or never set.
    - `active: false` (hidden product).
    - `purchasable: false` (off-sale product).
    - `releaseDate` in the future, which counts as a preorder, not a backorder.
- A standalone test: a full allowance (`backorderLimit: 5`, `backordered: 5`) still returns `true`.

## Relationships
- Imports and tests `isBackorder` from `src/modules/products/domain/backorder.ts`. It is the only dependency, and nothing is mocked.

## Notes
- `isBackorder` judges only the product's terms, not inventory. The test comments say the allowance is enforced elsewhere: `availableFor` enforces it, and `availabilityOf` adds it to its own answer. The cart uses `isBackorder` to decide whether a line may go past the shelf.
- `it.each` rows are `[name, facts, expected]`. The facts are partial objects.
