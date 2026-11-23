---
source: src/modules/cart/tests/unit/retention.test.ts
source_sha256: 8ac9bf607f0aad696452c1f222adc33dab00a53d4dfa74aca92868a9e9bf1090
context_sha256: fe43b18f201c8f891b1838121f428e62428d63bf6e2891a859eb4db4356a5157
generated_at: 2026-11-22T04:43:30.267725+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/cart/tests/unit/retention.test.ts

## Purpose
Unit test for the TTL retention configured on the cart collection. The TTL index is built once at import time from `NODE_CART_RETENTION_DAYS`, so each test re-imports the cart model with a fresh module registry to force that environment read to run again. It mirrors `src/modules/audit-logs/tests/unit/retention.test.ts`.

## Key elements
- `loadSchema()`: calls `jest.resetModules()`, dynamically imports `@modules/cart/model`, and returns its `cartSchema`.
- `ttlSeconds(schema)`: scans `schema.indexes()` and returns the first `expireAfterSeconds` value found, or `undefined`.
- `describe('cart retention')` with two tests:
  - Default: with `NODE_CART_RETENTION_DAYS` unset, the TTL is `365 * 24 * 60 * 60` seconds.
  - Configured: with `NODE_CART_RETENTION_DAYS` set to `'30'`, the TTL is `30 * 24 * 60 * 60` seconds.
- `afterEach` calls `jest.resetModules()` so no module state leaks out of the file.

## Relationships
- `src/modules/cart/model.ts`: the unit under test. The test imports it dynamically and reads `cartSchema` and its indexes.
- `tests/support/environment.ts`: supplies `setEnvironment` (imported via the `@tests/environment` alias), which sets or unsets `NODE_CART_RETENTION_DAYS` before each import.

## Notes
- The top-level `import type { Schema } from 'mongoose'` is deliberate. It makes TypeScript treat the file as a module rather than a global script. Without it, `loadSchema` and `ttlSeconds` would collide with the identically named globals in the `audit-logs` test.
- The environment variable must be set before `loadSchema()` runs, because the model reads it at import time.
