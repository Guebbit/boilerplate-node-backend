# src/modules/products/tests/unit/fixtures.test.ts

## Purpose

Unit tests for the `makeProduct` fixture builder. This test suite is critical because `makeProduct` is **not test-only**: it seeds the shipped demo dataset via `demo.ts` and `scripts/export-demo-dataset.ts` (published as `db/demo/demo-data.json`). A defect here propagates into a published artifact, not just a test run.

## Key elements

- **`describe('makeProduct')`** — single test block with seven cases covering the builder's contract:
  - *No-override default* — asserts `_id`, `title`, and `price` are present (the schema's required fields).
  - *ID override* — a hex string is accepted and stored as a real `Types.ObjectId`.
  - *Field override* — `title`/`price` can be replaced; other defaults remain untouched.
  - *Unspecified fields are absent* — `active`, `onHand`, `reserved`, `categories`, `tags`, `description` must **not** exist as own keys (so Mongoose `default:` applies).
  - *Falsy overrides preserved* — `active: false` and `onHand: 0` survive (compacting must key on `undefined`, not truthiness).
  - *`deletedAt` ISO→Date* — a seed-file string is converted to a `Date` instance.
  - *Timestamp derivation* — when no explicit timestamps are given, `createdAt` is back-calculated from the ObjectId's embedded timestamp.

## Relationships

- **`src/modules/products/fixtures.ts`** — the module under test; provides the `makeProduct` export. This file imports it via `@modules/products/fixtures` and exercises its full behavioral contract.

## Notes

- The "omits unspecified fields" test is the guard for `stripUndefined`. If the builder ever starts emitting `{ active: undefined }`, Mongoose sees the key, skips the schema default, and produces an unpublished product — silently, in both tests and the demo export.
- The falsy-preservation test (`active: false`, `onHand: 0`) exists specifically to prevent a regression where `stripUndefined` accidentally compacts on falsiness rather than strict `undefined`.
- The ObjectId-timestamp test pins a subtle derivation: `createdAt` is not an independent random value but is read from the hex id's 4-byte timestamp prefix. Changing the id generation strategy without updating this test will break timestamp consistency.
