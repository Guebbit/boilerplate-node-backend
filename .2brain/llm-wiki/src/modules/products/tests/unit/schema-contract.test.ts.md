---
source: src/modules/products/tests/unit/schema-contract.test.ts
sha256: 857bd555009a8815cfa21565ce336fcc013099be20338c98c0c36a46275d8903
generated_at: 2026-10-15T11:50:18.609080+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/tests/unit/schema-contract.test.ts

## Purpose

Contract test that pins the behavioral guarantees of the product schema and its `applyProductTransform`: which fields are required, what defaults a new product receives, which indexes are declared (and why), and how the derived `available` counter is computed from `onHand` and `reserved`. It exists so that changing any of these without updating the test fails CI, making implicit product-shape assumptions explicit.

## Key elements

- **`serialize(onHand, reserved)`** — local helper that builds a minimal document `{ _id, onHand, reserved }`, runs it through `applyProductTransform`, and returns the derived `.available`. Used by all transform tests.
- **`describe('productSchema — what a product must carry')`** — asserts the required path set (`title`, `price`), `min: 0` on both stock counters, and the exact defaults: `onHand: 0`, `reserved: 0`, `active: true`, `requiresShipping: true`, `description: ''`, `categories: []`, `tags: []`, `imageUrl: undefined`, `deletedAt: undefined`. Also asserts `timestamps: true`.
- **`describe('productSchema — indexes')`** — asserts the three named indexes (`products_active_deletedAt`, `products_createdAt`, `products_sku`) and that `products_sku` is both `sparse` and `unique`.
- **`describe('applyProductTransform — the derived availability')`** — asserts `available = max(0, onHand − reserved)`, that missing counters are treated as `0` (not `NaN`), and that non-numeric counters are treated as `0` rather than coerced.

## Relationships

- **`src/modules/products/model.ts`** — provides `productSchema` (the Mongoose schema under inspection) and `applyProductTransform` (the function whose derived `available` output is tested). This file is the sole consumer under test.
- **`tests/support/schema.ts`** — provides the schema-introspection utilities (`requiredPaths`, `pathOptions`, `defaultOf`, `optionsOf`, `indexSpecs`, `indexOptionSpecs`) that turn a Mongoose schema object into plain assertions. No other logic is imported from here.

## Notes

- Comments reference cross-module contracts by number (e.g. "3.1", "SH4") and sibling modules (`openapi.yaml`, `orders`' `orders_transferReference`). These are documentation anchors, not imports.
- The `serialize` helper intentionally passes `unknown`-typed values (including `undefined` and strings) to exercise the transform's defensive paths; it is not a fixture for happy-path only.
- The sparse+unique assertion on `products_sku` encodes a non-obvious Mongoose behavior: an unfiltered unique index would collide on multiple `null` values, so `sparse: true` is load-bearing.
- Tests assert exact index name strings (e.g. `'products_createdAt: createdAt-1'`), so renaming or reordering indexes in `model.ts` will break this file even if the schema is semantically identical.
