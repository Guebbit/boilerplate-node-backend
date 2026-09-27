---
source: tests/unit/infrastructure/persistence/normalize-email.test.ts
sha256: 6fd17dbb0d5b3ffce08700eb21c1bcbf2db018f9c2db1490eecf2dfd165c890f
generated_at: 2026-09-27T16:09:37.344629+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/persistence/normalize-email.test.ts

## Purpose

Unit tests for the `normalizeEmail` helper, verifying that email addresses are trimmed of surrounding whitespace and lowercased before persistence.

## Key elements

- **`describe('normalizeEmail')`** — test suite scoped to the `normalizeEmail` function imported from `@infrastructure/persistence/normalize-email`.
- **"trims surrounding whitespace and lowercases the address"** — asserts `normalizeEmail('  Ada@Example.com  ')` returns `'ada@example.com'`.
- **"is idempotent on an already-normalized address"** — asserts that passing an already-clean address (`'ada@example.com'`) returns the same value unchanged.

## Relationships

- **`src/infrastructure/persistence/normalize-email.ts`** — the sole dependency under test; exports the `normalizeEmail` function that this file exercises.

## Notes

- The import uses the `@infrastructure` path alias, mirroring the project's aliasing convention for `src/` subdirectories.
- Tests are intentionally minimal (two cases); there is no coverage for edge cases like empty strings, missing `@`, or multi-space input — only basic trim/lowercase and idempotency are asserted.
