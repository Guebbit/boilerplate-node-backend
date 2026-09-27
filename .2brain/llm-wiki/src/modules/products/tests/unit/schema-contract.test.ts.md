---
source: src/modules/products/tests/unit/schema-contract.test.ts
sha256: d8e1fe0b27a5a0e4f95073cec62b139f013bb6f8de306d33ff46e9fdaa5f36a7
generated_at: 2026-09-27T15:35:38.806288+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/tests/unit/schema-contract.test.ts

## Purpose

Locks down the product schema's contract — required fields, validation bounds, defaults, and index declarations — and pins the behavior of `applyProductTransform`'s derived `available` value. It exists so that any change to the schema or transform must consciously update these expectations, making the "what a product means when a field was never set" contract explicit and regression-safe.

## Key elements

- **`serialize(onHand, reserved)`** — local helper that builds a minimal document and runs it through `applyProductTransform`, returning only the computed `.available`. Used by every transform test.
- **`describe('productSchema — what a product must carry')`** — asserts required paths (`price`, `title` only), `min: 0` on both stock counters, and the full default set: `onHand`/`reserved` → 0, `active` → true, `requiresShipping` → true, `description` → `''`, `categories`/`tags` → `[]`, `imageUrl` → env-overridable placeholder, `deletedAt` → undefined, `timestamps` → true.
- **`describe('productSchema — indexes')`** — asserts the exact named index set (`products_active_deletedAt`, `products_createdAt`, `products_sku`) and that `products_sku` is both sparse and unique (SH4).
- **`describe('applyProductTransform — the derived availability')`** — verifies `available = onHand - reserved` clamped at 0, that `undefined` counters are treated as 0 (not NaN), and that non-number values are treated as 0 rather than coerced.

## Relationships

- **`src/modules/products/model.ts`** — the sole subject under test; provides `productSchema` (the Mongoose/compile schema) and `applyProductTransform` (the read-transform that computes `available`).
- **`tests/support/schema.ts`** — supplies the introspection utilities the tests rely on: `requiredPaths`, `defaultOf`, `pathOptions`, `optionsOf`, `indexSpecs`, `indexOptionSpecs`. The tests never inspect the schema object directly; all assertions go through these helpers.

## Notes

- The `imageUrl` default assertion reads `process.env.NODE_DEFAULT_IMAGE_PRODUCT` at test time; a deployment that sets that env var will see a different expected value.
- The transform tests intentionally pass `undefined` and string values to `onHand`/`reserved`. These are defensive paths for legacy documents or malformed writes — they are not expected in normal operation but must not produce `NaN` or a silently coerced number.
- Comments reference external contract IDs ("SH4" for the sparse-unique SKU rule, "3.1" for the inventory-row-at-creation guarantee) that live outside this file; changing those external contracts without updating the tests here will break the build.
