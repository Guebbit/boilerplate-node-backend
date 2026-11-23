---
source: src/modules/example/tests/unit/schema-contract.test.ts
source_sha256: 440012ecf30560821b09233183bfcbdbd91826bf0c0076835e1b71b2caff05a0
context_sha256: 2c23e85473db30d9c816f661cd372d6c479fd3e293be710fae543a7c165e01c7
generated_at: 2026-11-22T05:15:32.758880+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/example/tests/unit/schema-contract.test.ts

## Purpose
Unit tests that pin down the contract of `exampleSchema`: which fields are required, how `status` is constrained and initialized, that `publishedAt` has no default, which index supports an owner's list, and that timestamps are enabled. It guards against accidental schema changes that would break these guarantees.

## Key elements
- **`describe('exampleSchema')`** – the single suite, with five tests:
  - Required paths are exactly `body`, `title`, `userId`.
  - `status` enum equals `Object.values(ExampleStatus)` and defaults to `ExampleStatus.draft`.
  - `publishedAt` has no default (checked with `toBeUndefined`), so drafts aren't treated as already published.
  - The schema has an index named `userId_1_createdAt_-1` on `userId` ascending, `createdAt` descending (an owner's examples, newest first).
  - `timestamps` option is `true`.

## Relationships
- **`src/modules/example/model.ts`** – supplies `exampleSchema`, the object under test.
- **`src/types/index.ts`** – supplies the `ExampleStatus` enum (imported via `@types`) used to check the allowed values and the default.
- **`tests/support/schema.ts`** – supplies the schema-introspection helpers (imported via `@tests/schema`): `requiredPaths`, `enumOf`, `defaultOf`, `indexSpecs`, `optionsOf`.

## Notes
- The tests inspect schema definitions only; they do not exercise a database or create documents.
- The index assertion uses `toContain` on the spec strings, so additional indexes would not fail it.
- The timestamps test is tied to the index: the list is ordered by `createdAt`, which `timestamps: true` provides.
