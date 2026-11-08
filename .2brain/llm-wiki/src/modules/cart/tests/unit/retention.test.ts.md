---
source: src/modules/cart/tests/unit/retention.test.ts
sha256: 84a8d2a60a93d26d7856196af4a6f56c947575304bac7fb14ff68dfb8841bc43
generated_at: 2026-11-08T05:25:01.679436+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/tests/unit/retention.test.ts

## Purpose

Verifies that the cart collection's TTL index picks up the correct retention period from the `NODE_CART_RETENTION_DAYS` environment variable. Because the model reads this variable once at import time, the test re-imports the model in a fresh module registry for each case. Mirrors the structure of `audit-logs/tests/unit/retention.test.ts`.

## Key elements

- **`loadSchema()`** — Calls `jest.resetModules()` then dynamically imports `@modules/cart/model`, returning `cartSchema`. Forces the import-time environment read to execute again.
- **`ttlSeconds(schema)`** — Scans a Mongoose `Schema`'s index definitions and returns the first `expireAfterSeconds` value found (i.e., the TTL the index was declared with).
- **`describe('cart retention')`** — Two test cases: one asserts the default of 365 days when the variable is unset; the other asserts that a configured value (`'30'`) is honoured. Both rely on `afterEach` resetting the module registry.

## Relationships

- **`src/modules/cart/model.ts`** — The unit under test. Dynamically re-imported by `loadSchema()` so its import-time read of `NODE_CART_RETENTION_DAYS` runs in a clean registry.
- **`tests/support/environment.ts`** — Supplies `setEnvironment()`, used by each test to set (or clear) `NODE_CART_RETENTION_DAYS` before re-importing the model.

## Notes

- The file **must** contain a real top-level import (the `import type { Schema } from 'mongoose'` line) so TypeScript treats it as a module. Without it, the file becomes a global script and its top-level `loadSchema`/`ttlSeconds` collide with the identically-named globals in the audit-logs retention test.
- `ttlSeconds` only inspects `schema.indexes()`; it does not query the live database or connect to MongoDB.
- The dynamic import path uses the alias `@modules/cart/model`, while the type import uses the bare `mongoose` package — keep the alias consistent if the model's export shape changes.
