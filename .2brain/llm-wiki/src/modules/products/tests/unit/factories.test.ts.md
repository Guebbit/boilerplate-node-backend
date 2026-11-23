---
source: src/modules/products/tests/unit/factories.test.ts
source_sha256: d8c4f2cd057d9071968a54090e0071e82ec3af38c890407c0f04bd8733a0c78f
context_sha256: a772ac7910a9abb0f860d20e31133a11adcf909f97811e661d02987aebe47ab7
generated_at: 2026-11-22T07:19:14.657397+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/products/tests/unit/factories.test.ts

## Purpose
Unit tests for `makeProduct`, the catalogue fixture builder in `src/modules/products/factories.ts`. The builder is not test-only: `scenarios/products.ts` also uses it to seed the shipped demo catalogue, so a defect in it reaches every seeded product. The tests pin down the rule that any field a record doesn't state is left to the schema's `default:`.

## Key elements
- `HEX` — a fixed valid ObjectId string (`65dc8a99604c307b702b5ccc`) so expectations can name the id.
- `describe('makeProduct')` cases:
  - **No overrides:** `_id` is a `Types.ObjectId`, `title` is `'Test Product'` and `price` is `'9.99'`. These are the schema's two required fields.
  - **Id handling:** a given `id` string becomes a real ObjectId whose string form equals the input.
  - **Overrides:** `title` and `price` overrides replace the defaults.
  - **Omitted fields:** `active`, `onHand`, `reserved`, `categories`, `tags` and `description` are absent as keys (`Object.hasOwn` is false). This is the behavior `stripUndefined` provides, because a key present as `undefined` blocks Mongoose's schema default (e.g. `active: true`).
  - **Falsy overrides:** `active: false` and `purchasable: false` are kept rather than dropped, so the stripping must test for `undefined` and not falsiness.
  - **Soft-delete conversion:** a `deletedAt` ISO string becomes a `Date` with the same ISO value (the `toDate` conversion).
  - **Timestamps:** with no timestamps stated, `createdAt` equals the timestamp embedded in the record's own ObjectId.

## Relationships
- Imports `makeProduct` from `@modules/products/factories` (`src/modules/products/factories.ts`), the only unit under test.
- Imports `Types` from `mongoose` for the `ObjectId` and `Date` assertions.

## Notes
- The tests assert on the returned plain object's keys, so adding a default for a field the schema already defaults would fail the "omits unspecified fields" test.
- Seed files state dates as ISO strings, while the schema stores `Date`. The conversion test covers that mismatch.
