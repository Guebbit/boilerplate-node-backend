---
source: src/modules/wishlist/tests/unit/schema-contract.test.ts
sha256: 87dc31a9c242998317d3ab607c59c613e2ad1b46858fa33b105518e7e666063b
generated_at: 2026-09-23T19:49:37.651537+00:00
model: ollama:qwen3.8:27b
---

# src/modules/wishlist/tests/unit/schema-contract.test.ts

## Purpose

Contract test that pins the structural invariants of `wishlistSchema` — the index, defaults, types, refs, and sub-schema shape that make the "one wishlist per user" and "no per-line identity" design enforceable at the database level. It asserts _what the schema declares_, not _what operations do_, so a silent schema change breaks the build before it breaks a query.

## Key elements

- **`describe('wishlistSchema', …)`** — single block, six `it` cases, no setup/teardown.
    - _requires an owner and nothing else_ — `requiredPaths` must be `['userId']`; `items` is intentionally optional.
    - _makes one wishlist per user a database fact_ — `indexOptionSpecs` must include `userId_1: unique=true`.
    - _starts a new wishlist with an empty list_ — `defaultOf(schema, 'items')` must be `[]` so readers never see `undefined`.
    - _stores the owner and the product as references_ — `typeOf`/`refOf` confirm `ObjectId` refs to `User` and `Product`.
    - _gives a line no id of its own, and no quantity_ — sub-schema for `items` has `_id: false`, only `productId`, nothing else.
    - _indexes the product lookup_ — `indexSpecs` must list both `items.productId_1` and `userId_1`.
    - _keeps timestamps_ — `optionsOf(schema).timestamps` is `true`.
- **Imports from `@tests/schema`** — pure inspection helpers (`requiredPaths`, `indexOptionSpecs`, `defaultOf`, `typeOf`, `refOf`, `subSchema`, `optionsOf`, `pathNames`, `indexSpecs`). No document is ever created or saved.

## Relationships

- **`src/modules/wishlist/model.ts`** — source of the `wishlistSchema` object under test; the sole production import.
- **`tests/support/schema.ts`** — provides the schema-inspection utilities that turn a Mongoose schema into comparable plain values; the sole test-support import.

## Notes

- The file's module docstring and inline comments are the primary documentation of _why_ each invariant exists (e.g., `$addToSet` idempotence depends on no per-line `_id`; product-deletion cascade depends on the `items.productId` index). Treat them as spec, not just commentary.
- The `items.productId` index is deliberately unnamed so Mongoose derives the name; the test asserts the derived name `items.productId_1`. Renaming the index or adding a conflicting one will fail this test.
- No mocking, no database connection, no `beforeEach`. The test is synchronous and pure.
