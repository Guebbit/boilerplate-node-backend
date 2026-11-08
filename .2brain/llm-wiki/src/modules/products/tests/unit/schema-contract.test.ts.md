---
source: src/modules/products/tests/unit/schema-contract.test.ts
sha256: 3e59406cae154dbefb22cd8853793d2fad92a314ec1a15d629d753bdbf5acc06
generated_at: 2026-11-08T07:54:33.653608+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/tests/unit/schema-contract.test.ts

## Purpose

Contract tests that pin the product schema's field requirements, defaults, indexes, and the `available` derivation logic in `applyProductTransform`. They exist to guarantee that the minimal create path, stock accounting, visibility scope, and SKU uniqueness all behave as the rest of the system (cart, catalogue, ledger replay) expects without having to re-derive those assumptions at runtime.

## Key elements

- **`serialize(onHand, reserved)`** — local helper that calls `applyProductTransform` on a synthetic document and returns the computed `available` value; used by every transform test.
- **`describe('productSchema — what a product must carry')`** — asserts required paths (`price`, `title`), non-negative min on stock counters, and the concrete default for every optional field (`onHand: 0`, `reserved: 0`, `active: true`, `requiresShipping: true`, `description: undefined`, `categories: []`, `tags: []`, `imageUrl: undefined`, `deletedAt: undefined`).
- **`describe('productSchema — indexes')`** — asserts the exact set of three named indexes and that `products_sku` is sparse + unique.
- **`describe('applyProductTransform — the derived availability')`** — asserts `available = max(0, onHand − reserved)`, that missing or non-number counters are treated as zero (not NaN, not coerced).

## Relationships

- **`src/modules/products/model.ts`** — source of `productSchema` (Mongoose schema) and `applyProductTransform`; this file is the sole consumer under test.
- **`tests/support/schema.ts`** — provides the introspection utilities (`defaultOf`, `indexSpecs`, `indexOptionSpecs`, `optionsOf`, `pathOptions`, `requiredPaths`) that let the tests assert on schema metadata without executing MongoDB.

## Notes

- The tests deliberately assert *absence* as a meaningful default (`description`, `imageUrl`, `deletedAt` must be `undefined`, not `''` or a date). Flipping any of these to a concrete value changes wire behavior and consumer branching.
- The SKU index is **sparse**; the test encodes that an unfiltered unique index would collide on the implicit `null` entries. Any schema change that adds a default to `sku` will break this test.
- `serialize` passes raw `unknown` values (including strings and `undefined`) into `applyProductTransform`; the transform is expected to reject non-numeric inputs rather than coerce them. This is a deliberate contract, not a Mongoose-level guarantee.
