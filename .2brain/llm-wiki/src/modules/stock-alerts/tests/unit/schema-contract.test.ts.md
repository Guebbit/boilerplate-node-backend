---
source: src/modules/stock-alerts/tests/unit/schema-contract.test.ts
source_sha256: e56a07e3d9e9cbfc0c55eb1029e2b99f3beda2d069bb35918c4b159435763846
context_sha256: 79f2685ccaebc3264bb3ec3e92d7eb3f091c8f7b5d7e91a9342c0248cf4cb61b
generated_at: 2026-11-22T07:56:19.662687+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/stock-alerts/tests/unit/schema-contract.test.ts

## Purpose
Unit test that pins the declared contract of `stockAlertSchema`: required paths, refs, indexes, and timestamps. It inspects the schema's declarations, not documents. The point is that "one request per user and product" is enforced by a unique index in the database, so removing `unique` would not break any valid-fixture test and needs a test of its own.

## Key elements
- **`describe('stockAlertSchema')`** holds five assertions:
  - **Required paths:** only `productId` and `userId` are required.
  - **Refs:** `userId` refs `User` and `productId` refs `Product`.
  - **Unique pair:** the index spec `userId_1_productId_1: unique=true` is present.
  - **Exact index set:** the indexes are exactly `productId_1` (per-product lookup) and `userId_1_productId_1` (the unique pair).
  - **Timestamps:** the schema's `timestamps` option is `true`.

## Relationships
- Imports `stockAlertSchema` from `@modules/stock-alerts/model`, which is the schema under test.
- Imports the introspection helpers `requiredPaths`, `refOf`, `indexSpecs`, `indexOptionSpecs` and `optionsOf` from `@tests/schema` (`tests/support/schema.ts`). They turn schema declarations into plain values and strings for comparison.

## Notes
- The index and required-path assertions use `toEqual` with exact arrays. Adding an index or a required field to the model fails these tests until they are updated on purpose.
- Index specs are strings in the form `name: field+direction, ...`. Option specs are in the form `name: unique=true`.
