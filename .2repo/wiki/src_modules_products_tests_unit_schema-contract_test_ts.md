# src/modules/products/tests/unit/schema-contract.test.ts

## Purpose

Unit tests that pin down the product schema's contract: which fields are required, what defaults each field carries, what constraints guard stock counters, which indexes are declared, and how `applyProductTransform` derives the shopper-facing `available` value. The inline comments document the *reason* each default exists so future changes to `model.ts` are made with full awareness of downstream impact.

## Key elements

- **`serialize(onHand, reserved)`** — local helper that builds a minimal document and runs it through `applyProductTransform`, returning only the computed `.available`.
- **`describe('productSchema — what a product must carry')`** — asserts required paths are exactly `['price','title']`; `onHand`/`reserved` have `min: 0`; defaults for `onHand` (100), `reserved` (0), `active` (true), `description` (`''`), `categories`/`tags` (`[]`), `imageUrl` (env-overridable placeholder), and `deletedAt` (undefined); and that `timestamps` is enabled.
- **`describe('productSchema — indexes')`** — asserts exactly two named indexes: `products_active_deletedAt` (active+1, deletedAt+1) and `products_createdAt` (createdAt-1).
- **`describe('applyProductTransform — the derived availability')`** — verifies `available = max(0, onHand - reserved)`, that missing counters are treated as zero (not `NaN`), and that non-number types are treated as zero rather than coerced.

## Relationships

- **`src/modules/products/model.ts`** — provides `productSchema` (the Mongoose schema under test) and `applyProductTransform` (the discriminator transform that computes `available`). Every assertion in this file is a contract on those two exports.
- **`tests/support/schema.ts`** — provides the introspection helpers (`requiredPaths`, `pathOptions`, `defaultOf`, `optionsOf`, `indexSpecs`) that let tests read schema metadata declaratively rather than inspecting raw Mongoose internals.

## Notes

- The `imageUrl` default reads `process.env.NODE_DEFAULT_IMAGE_PRODUCT` at test-run time; a deployment that sets this env var will cause this test to pass with a different expected string.
- The "wrong type" test (`serialize('12', 2) → 0`) encodes a deliberate non-coercion policy: a string counter is treated as zero, not parsed. Changing `applyProductTransform` to use `Number()` would break this contract.
- The `deletedAt` default test asserts `undefined` (not `null`); the soft-delete check downstream is the *absence* of the key, so a `null` default would change visibility semantics.
