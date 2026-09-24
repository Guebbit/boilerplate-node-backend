---
source: src/modules/products/tests/unit/schema-contract.test.ts
sha256: 350d7f44b6d26d08cf62af515d083c255a3b3fd16de4044cb55fcdba13b14c58
generated_at: 2026-09-23T19:31:01.490844+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/tests/unit/schema-contract.test.ts

## Purpose

Unit tests that pin down the product schema's field contract (required fields, defaults, min constraints, indexes, timestamps) and the `applyProductTransform` function that derives an `available` count from the `onHand` / `reserved` stock counters. They exist to make the _intent_ behind each default explicit and to prevent regressions that would silently break downstream consumers (cart, facet, storefront).

## Key elements

- **`serialize(onHand, reserved)`** (local helper) — builds a minimal product document and returns `applyProductTransform(doc).available`, used by all availability tests.
- **`describe('productSchema — what a product must carry')`** — asserts required paths are exactly `['price','title']`; min 0 on both stock counters; defaults for `onHand`, `reserved`, `active`, `requiresShipping`, `description`, `categories`, `tags`, `imageUrl`, `deletedAt`; and that `timestamps` is enabled.
- **`describe('productSchema — indexes')`** — asserts the two named compound indexes (`products_active_deletedAt`, `products_createdAt`) and their sort directions.
- **`describe('applyProductTransform — the derived availability')`** — verifies subtraction, clamping at zero, `undefined`-counter safety (avoids `NaN`→`null`), and that non-number values are treated as zero rather than coerced.

## Relationships

- **`src/modules/products/model.ts`** — source of `productSchema` (Mongoose schema under test) and `applyProductTransform` (the transform whose output this file exercises).
- **`tests/support/schema.ts`** — provides the schema-introspection helpers (`requiredPaths`, `defaultOf`, `pathOptions`, `optionsOf`, `indexSpecs`) used to query the schema without instantiating documents.

## Notes

- The `imageUrl` default reads `process.env.NODE_DEFAULT_IMAGE_PRODUCT`; tests will pass any string, so the assertion is order-sensitive to the env var's state at test time.
- Several comments reference external contracts (`openapi.yaml` defaults, the `inventory` module's stock counters, the facet endpoint, the `cart` shipping decision) — these are _rationale_ for the assertion, not additional imports.
- The `serialize` helper hardcodes `_id: 'x'`; the transform does not read `_id`, but the document shape mirrors what a real Mongoose doc would look like.
- The "wrong type" test (`'12'` for `onHand`) documents a deliberate design choice: fail visibly with 0 rather than risk JS numeric coercion producing a plausible-but-wrong availability number.
