---
source: src/modules/products/tests/unit/factories.test.ts
sha256: 0d3d18cfce1ba138f8bc9de9c520f14c7b2fc8e929678b5d787e2a14e5e31e21
generated_at: 2026-09-23T19:30:37.596875+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/tests/unit/factories.test.ts

## Purpose

Unit tests for the `makeProduct` fixture builder. They pin down the factory's contract: which fields are always present, how overrides interact with Mongoose schema defaults, how `undefined` values are stripped, and how falsy-but-meaningful values are preserved. Because the same factory is used by `scenarios/products.ts` to seed the shipped demo catalogue, a regression here propagates beyond the test suite into production fixtures.

## Key elements

- **`HEX`** — a fixed ObjectId hex string (`65dc8a99604c307b702b5ccc`) reused as a known id across several cases.
- **`describe('makeProduct')`** — seven assertions:
  - Bare call yields a valid document with the two schema-required fields (`title`, `price`) and an `ObjectId`.
  - A supplied `id` is stored verbatim as an `ObjectId`.
  - Explicit overrides (`title`, `price`) replace schema defaults.
  - Fields not passed in are **absent** from the object (`Object.hasOwn` is false), confirming `stripUndefined` drops them so Mongoose `default:` can apply.
  - Falsy overrides (`active: false`, `onHand: 0`) are **retained**, proving compaction keys on `undefined` rather than truthiness.
  - An ISO-string `deletedAt` is converted to a `Date` instance.
  - `createdAt` is derived from the embedded timestamp of the supplied ObjectId when no explicit timestamps are given.

## Relationships

- **`src/modules/products/factories.ts`** — sole subject under test; `makeProduct` is imported from here. All assertions exercise its return value.
- **`mongoose` (Types)** — used to assert `ObjectId` identity and to read an ObjectId's embedded timestamp.

## Notes

- The docblock explicitly warns this file is **not test-only**: `scenarios/products.ts` calls the same factory to seed the demo catalogue, so a broken default or stripped field silently ships an invisible demo product.
- The `stripUndefined` rule is the core invariant: a key present with value `undefined` blocks Mongoose's `default:`. The "omits unspecified fields" test guards this directly.
- Falsy-preservation (`false`, `0`) is called out because compaction on truthiness would drop exactly the values needed to exercise the visibility and out-of-stock branches.
- `deletedAt` conversion is tested because seed files write ISO strings, not `Date` objects; without `toDate` the soft-delete code path is never exercised.
