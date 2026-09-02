# src/modules/products/tests/unit/schema-contract.test.ts

## Purpose

Contract tests that pin down the product schema's defaults, constraints, and index declarations, and verify the `available` derivation performed by `applyProductTransform`. The tests exist to document *why* each default is what it is (sellable-by-default, empty-vs-absent arrays, no soft-delete default) so that schema changes break loudly rather than silently altering storefront behaviour.

## Key elements

- **`serialize(onHand, reserved)`** — local helper that calls `applyProductTransform` on a minimal document and returns only the derived `.available` value.
- **`describe('productSchema — what a product must carry')`** — asserts required paths (`price`, `title`), `min: 0` on stock counters, and the exact default for every other field (`onHand: 100`, `reserved: 0`, `active: true`, `requiresShipping: true`, `description: ''`, `categories: []`, `tags: []`, `imageUrl: <env-or-placeholder>`, `deletedAt: undefined`). Also asserts `timestamps: true`.
- **`describe('productSchema — indexes')`** — asserts the schema declares exactly two named compound indexes (`products_active_deletedAt`, `products_createdAt`) with the expected field order and direction.
- **`describe('applyProductTransform — the derived availability')`** — verifies `available = max(onHand − reserved, 0)`, that missing counters are treated as `0` (not `NaN`), and that non-numeric values are treated as `0` rather than coerced.

## Relationships

- **`src/modules/products/model.ts`** — source of the two symbols under test: `productSchema` (the Mongoose/DB schema) and `applyProductTransform` (the middleware that adds `available`).
- **`tests/support/schema.ts`** — provides the introspection helpers used throughout: `requiredPaths`, `defaultOf`, `pathOptions`, `optionsOf`, `indexSpecs`. These let the tests assert against the *declaration* rather than re-deriving logic.

## Notes

- `imageUrl`'s expected default reads `process.env.NODE_DEFAULT_IMAGE_PRODUCT` at test time; changing that env var in CI will break the assertion unless the test is updated in lockstep.
- `deletedAt` is asserted to have **no** default (`toBeUndefined()`). A well-meaning `default: null` would invert the soft-delete contract (presence = deleted).
- The transform tests deliberately pass `undefined` and a string (`'12'`) to document that the transform guards against pre-defaults documents and type drift — these are not "normal" inputs.
