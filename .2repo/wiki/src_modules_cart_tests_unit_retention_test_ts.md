# src/modules/cart/tests/unit/retention.test.ts

## Purpose

Verifies that the cart collection's TTL index is declared with the expected `expireAfterSeconds` value, both for the default (365 days) and for an operator-configured `NODE_CART_RETENTION_DAYS`. Because the model reads that env var **once at import time**, the test re-imports the model under a reset Jest module registry to exercise the read again.

## Key elements

- **`loadSchema()`** — Calls `jest.resetModules()`, then dynamically imports `@modules/cart/model` and returns `cartSchema`. Forces the import-time env-var read to re-execute.
- **`ttlSeconds(schema)`** — Walks `schema.indexes()`, returns the first `expireAfterSeconds` option found (or `undefined`).
- **`describe('cart retention')`** — Two cases: (1) env var unset → `365 * 86400`; (2) env var set to `'30'` → `30 * 86400`. Restores the original env value and resets the module registry in `afterEach`.

## Relationships

- **`src/modules/cart/model.ts`** — The sole subject under test. The test imports `cartSchema` from it (via dynamic `import('@modules/cart/model')` after `jest.resetModules()`) and inspects the index metadata on the returned Mongoose `Schema`. No other runtime coupling exists.

## Notes

- The top-level `import type { Schema } from 'mongoose'` is **load-bearing**: without any top-level import/export the file is a global script, and its `loadSchema`/`ttlSeconds` names would collide with the identically-named globals in `audit-logs/tests/unit/retention.test.ts` (which runs in the same Jest worker). Do not remove it.
- `NODE_CART_RETENTION_DAYS` is read **only at module load time**; changing the env var after import has no effect. This is why the test must `resetModules()` before each dynamic import.
- The pattern is intentionally duplicated from `audit-logs/tests/unit/retention.test.ts`. If the convention changes, update both files.
