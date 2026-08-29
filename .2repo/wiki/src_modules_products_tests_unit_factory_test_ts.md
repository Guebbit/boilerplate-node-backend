# src/modules/products/tests/unit/factory.test.ts

## Purpose

Unit tests for `makeProduct`, the product catalogue fixture builder. The function under test is **not** test-only: `demo.ts` and `scripts/export-demo-dataset.ts` use it to generate the published `db/demo/demo-data.json`, so a regression here corrupts a shipped artifact, not just a test run.

## Key elements

- **`describe('makeProduct', …)`** — single block, seven `it` cases:
  - *No overrides*: verifies required fields (`title`, `price`) and a generated `Types.ObjectId`.
  - *Explicit ID*: passes a hex string and asserts it round-trips as a real `ObjectId`.
  - *Override replacement*: confirms caller-supplied `title`/`price` replace the defaults.
  - *Omission / `compact`*: asserts that unspecified fields (`active`, `onHand`, `reserved`, `categories`, `tags`, `description`) are **absent** from the object (not set to `undefined`), so Mongoose schema `default:` values still apply.
  - *Falsy overrides preserved*: `active: false` and `onHand: 0` must survive compaction (they are meaningful, not "unspecified").
  - *ISO-string → `Date` conversion*: `deletedAt` given as an ISO string (as seed files write it) is stored as a `Date` instance.
  - *Timestamp derivation*: when no timestamps are supplied, `createdAt` is derived from the `ObjectId`'s embedded timestamp.

## Relationships

- **`src/modules/products/factory.ts`** — sole import under test (`makeProduct`). This file is the only consumer in the dependency graph that exercises the factory's contract; the factory has no back-reference to this test file.

## Notes

- The **`compact` rule** is the core invariant: an override key that is `undefined` must be *deleted*, not set, because Mongoose treats a present-`undefined` key as an explicit "set to nothing" and skips the schema default.
- Compaction must key on `undefined` (or `hasOwn` absence), **not** on falsiness — otherwise `active: false` and `onHand: 0` would be silently dropped, breaking the visibility and out-of-stock test paths.
- The `HEX` constant (`65dc8a99604c307b702b5ccc`) is a fixed `ObjectId` used to make the ID-passthrough and timestamp-derivation tests deterministic.
- The file header comment explicitly warns that defects propagate to `db/demo/demo-data.json` consumed by the paired frontend; treat this test file as a guard on a published artifact, not merely a unit-test convenience.
