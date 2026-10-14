---
source: src/modules/cart/tests/unit/retention.test.ts
sha256: 84a8d2a60a93d26d7856196af4a6f56c947575304bac7fb14ff68dfb8841bc43
generated_at: 2026-10-14T15:19:50.992263+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/tests/unit/retention.test.ts

## Purpose

Unit test that verifies the cart collection's TTL index is created with the correct `expireAfterSeconds` value derived from `NODE_CART_RETENTION_DAYS`. Because the TTL index is built once at import time in the model, the test re-imports the model under a fresh module registry to trigger that import-time read again.

## Key elements

- **`loadSchema()`** — Calls `jest.resetModules()`, dynamically re-imports `@modules/cart/model`, and returns the exported `cartSchema`. This forces the import-time TTL configuration to re-execute with the current environment.
- **`ttlSeconds(schema)`** — Scans a Mongoose `Schema`'s declared indexes for the first non-undefined `expireAfterSeconds` value and returns it.
- **`describe('cart retention')`** — Two test cases:
  - *defaults to 365 days when the variable is unset* — asserts TTL is `365 * 24 * 60 * 60` seconds.
  - *honours a configured retention* — sets the variable to `'30'` and asserts TTL is `30 * 24 * 60 * 60` seconds.
  - `afterEach` resets the Jest module registry to prevent cross-test leakage.

## Relationships

- **`src/modules/cart/model.ts`** — The module under test. Imported dynamically (not statically) so each call to `loadSchema` re-evaluates it and reads `NODE_CART_RETENTION_DAYS` fresh.
- **`tests/support/environment.ts`** — Provides `setEnvironment`, used to stub `NODE_CART_RETENTION_DAYS` before each test's dynamic import.

## Notes

- The `import type { Schema } from 'mongoose'` line is load-bearing, not just a type annotation: without a top-level import the file would be treated as a *global script* by TypeScript, and its top-level `loadSchema`/`ttlSeconds` would collide with identically-named globals in `audit-logs/tests/unit/retention.test.ts`.
- This file intentionally mirrors `audit-logs/tests/unit/retention.test.ts`; changes to one pattern (e.g., the resetModules + dynamic-import approach) should be considered for the other.
