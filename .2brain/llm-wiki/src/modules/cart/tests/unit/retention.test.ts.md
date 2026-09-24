---
source: src/modules/cart/tests/unit/retention.test.ts
sha256: da3d69142521d603c1296d8137f0f4505baeca8591c6b09c4f4149960c57a726
generated_at: 2026-09-23T18:34:44.692387+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/tests/unit/retention.test.ts

## Purpose

Unit test that verifies the cart collection's TTL (time-to-live) index is created with the correct `expireAfterSeconds` value derived from the `NODE_CART_RETENTION_DAYS` environment variable. Because the model reads that variable only once at import time, the test must force a fresh module evaluation for each scenario.

## Key elements

- **`loadSchema()`** — Calls `jest.resetModules()` then dynamically re-imports `@modules/cart/model`, returning `cartSchema`. Ensures the import-time env-var read re-executes for each test case.
- **`ttlSeconds(schema)`** — Scans a Mongoose `Schema`'s declared indexes and returns the first non-undefined `expireAfterSeconds` value.
- **`describe('cart retention')`** — Two test cases: one asserting the 365-day default when the env var is unset, one asserting a custom value (`30` days). Each restores the env var and resets the module registry in `afterEach`.

## Relationships

- **`src/modules/cart/model.ts`** — The sole production dependency. Imported dynamically via `import('@modules/cart/model')` to access `cartSchema` and its TTL index declaration.

## Notes

- The top-level `import type { Schema } from 'mongoose'` is intentionally present (per the inline comment) to force TypeScript to treat this file as a **module** rather than a global script, preventing `loadSchema`/`ttlSeconds` from colliding with identically-named bindings in the analogous `audit-logs` retention test.
- Each test relies on `jest.resetModules()` so that the model's one-time env-var read at import time is re-evaluated; simply mutating `process.env` in the test body is not sufficient.
- The test mirrors the structure of `audit-logs/tests/unit/retention.test.ts` (explicitly referenced in the module docstring).
