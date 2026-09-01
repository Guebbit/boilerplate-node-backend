# src/modules/products/tests/unit/fixtures.test.ts

## Purpose

Unit tests for the `makeProduct` catalogue fixture builder. They verify that the builder produces valid, insertable documents, respects the omit-unset-field convention, preserves falsy overrides, performs type coercion on date strings, and derives timestamps from the ObjectId — protecting both the test suite and the published demo dataset that reuses the same function.

## Key elements

- **`describe('makeProduct', …)`** — single suite containing seven focused assertions:
  - Bare call yields a complete document (`_id`, `title: 'Test Product'`, `price: 9.99`).
  - `id` override is stored as a real `ObjectId`.
  - Arbitrary field overrides replace schema defaults.
  - Unspecified optional fields (`active`, `onHand`, `reserved`, `categories`, `tags`, `description`) are **absent** from the object (no key present as `undefined`).
  - Falsy overrides (`active: false`, `onHand: 0`) are **retained**, not dropped by compaction.
  - `deletedAt` supplied as an ISO string is converted to a `Date` instance.
  - `createdAt` is derived from the embedded ObjectId timestamp when no explicit timestamp is given.

## Relationships

- **`src/modules/products/fixtures.ts`** — sole production import (`makeProduct`). Every test case exercises this function directly; the test file exists solely to pin its contract.
- **`mongoose`** — provides `Types.ObjectId` used to construct and inspect ObjectId values and extract embedded timestamps.

## Notes

- The `compact` rule is the critical invariant: a key present as `undefined` blocks Mongoose's `default:` from applying, so the builder must delete unset overrides entirely rather than leaving `undefined` values. The test at line ~45 asserts this with `Object.hasOwn`.
- Compaction must key on `undefined` specifically, not on falsiness — the `active: false` / `onHand: 0` test exists because a falsy-based drop would silently remove the two values the visibility and out-of-stock test branches depend on.
- The module-level doc comment notes that `makeProduct` is **not test-only**: `demo.ts` and `scripts/export-demo-dataset.ts` consume it to produce `db/demo/demo-data.json`. A regression here ships to a published artifact, not just to a failing unit test.
- `deletedAt` coercion (string → `Date`) is tested because seed files store ISO strings while the schema expects a `Date`; without the conversion the soft-delete code path is never actually exercised.
