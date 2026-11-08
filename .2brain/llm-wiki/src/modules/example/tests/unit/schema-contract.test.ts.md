---
source: src/modules/example/tests/unit/schema-contract.test.ts
sha256: 440012ecf30560821b09233183bfcbdbd91826bf0c0076835e1b71b2caff05a0
generated_at: 2026-11-08T05:56:38.896777+00:00
model: ollama:qwen3.8:27b
---

# src/modules/example/tests/unit/schema-contract.test.ts

## Purpose

Contract test that pins down the public shape of `exampleSchema`: its required fields, status lifecycle defaults, the single composite index, and timestamp behavior. It exists so any schema change that silently breaks the owner-list query or the draft→published flow is caught before it reaches the database.

## Key elements

- **`describe('exampleSchema')`** — single test suite; no exported functions, the file's only artifact is its assertions.
- **`requiredPaths(exampleSchema)`** — asserts exactly `['body', 'title', 'userId']` are required (no more, no less).
- **`enumOf(exampleSchema, 'status')`** — asserts the `status` enum matches `Object.values(ExampleStatus)` from the shared types.
- **`defaultOf(exampleSchema, 'status')`** — asserts new documents start as `ExampleStatus.draft`.
- **`defaultOf(exampleSchema, 'publishedAt')`** — asserts *no* default is set, so drafts aren't accidentally stamped as published.
- **`indexSpecs(exampleSchema)`** — asserts the compound index `userId_1_createdAt_-1` is present.
- **`optionsOf(exampleSchema).timestamps`** — asserts Mongoose auto-timestamps are enabled (feeds the `createdAt` sort order).

## Relationships

- **`src/modules/example/model.ts`** — imports `exampleSchema`; this test is the sole consumer asserting its contract.
- **`src/types/index.ts`** — imports `ExampleStatus` to verify the schema's enum matches the application-level union rather than hard-coding strings.
- **`tests/support/schema.ts`** — imports the inspection helpers (`defaultOf`, `enumOf`, `indexSpecs`, `optionsOf`, `requiredPaths`) that abstract Mongoose schema internals into plain-data assertions.

## Notes

- The `publishedAt` test is intentionally negative: a "helpful" default of `new Date()` here would make every draft appear published. The comment in the source calls this out explicitly.
- The index assertion uses the Mongoose index name string (`userId_1_createdAt_-1: userId+1, createdAt-1`) rather than checking `schema.indexes` directly, keeping the test resilient to index-option changes while still pinning the column set and order.
- All helpers come from `@tests/schema`, not from a testing library, so they're safe to use without mocking Mongoose internals.
