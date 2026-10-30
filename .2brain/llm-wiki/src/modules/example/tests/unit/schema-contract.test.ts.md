---
source: src/modules/example/tests/unit/schema-contract.test.ts
sha256: 440012ecf30560821b09233183bfcbdbd91826bf0c0076835e1b71b2caff05a0
generated_at: 2026-10-29T03:58:51.726339+00:00
model: ollama:qwen3.8:27b
---

# src/modules/example/tests/unit/schema-contract.test.ts

## Purpose

Contract tests that pin down the shape, defaults, enum constraints, index definition, and timestamp option of the `exampleSchema`. They guard against silent schema drift (e.g., a new required field, a changed default status, or a missing index) that would break the owner's listing queries and lifecycle semantics.

## Key elements

- **`describe('exampleSchema')`** – the sole top-level suite; all assertions target the single exported schema.
- **`requiredPaths` assertion** – locks the required field set to exactly `['body', 'title', 'userId']`.
- **`enumOf` / `defaultOf` assertions on `status`** – enforces that `status` accepts only the `ExampleStatus` values and that new documents default to `ExampleStatus.draft`.
- **`defaultOf` assertion on `publishedAt`** – asserts the field has *no* default, so a draft is not accidentally stamped as published.
- **`indexSpecs` assertion** – verifies a compound index `userId_1_createdAt_-1` exists (owner + recency ordering).
- **`optionsOf` assertion on `timestamps`** – confirms Mongoose auto-manages `createdAt`/`updatedAt`.

## Relationships

- **`src/modules/example/model.ts`** – source of `exampleSchema`, the unit under test.
- **`src/types/index.ts`** – provides `ExampleStatus`, used as the expected enum value list.
- **`tests/support/schema.ts`** – provides the Mongoose-schema introspection helpers (`requiredPaths`, `enumOf`, `defaultOf`, `indexSpecs`, `optionsOf`) that turn the schema object into plain values for `expect()` comparisons.

## Notes

- The `publishedAt` test carries an inline comment explaining *why* the absence of a default matters; if a default were ever added, every draft would incorrectly appear already published.
- The index assertion compares against the exact Mongoose index-name string (`userId_1_createdAt_-1: userId+1, createdAt-1`), so renaming either field or flipping an order will fail the test.
