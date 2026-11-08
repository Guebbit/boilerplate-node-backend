---
source: src/modules/audit-logs/tests/unit/retention.test.ts
sha256: a1c65b22ff67fd8c08b89d791e3a8d37f1d3f24109cbb01aebef4b315f051368
generated_at: 2026-11-08T05:10:13.784376+00:00
model: ollama:qwen3.8:27b
---

# src/modules/audit-logs/tests/unit/retention.test.ts

## Purpose

Unit tests verifying that the audit-log collection's TTL index is declared with the correct `expireAfterSeconds` value, both for the default (90 days) and for a user-configured retention period. Because the retention value is read from the environment at **import time** (not at query time), the tests must re-import the model module to simulate a fresh process start.

## Key elements

- **`loadSchema`** – Resets the Jest module registry (`jest.resetModules()`) and dynamically re-imports `@modules/audit-logs/model`, returning the freshly constructed `auditLogSchema`. This forces the import-time environment read to execute again with whatever value `setEnvironment` has staged.
- **`ttlSeconds`** – Walks the schema's declared indexes, extracts the `expireAfterSeconds` option (the Mongoose TTL field), and returns the first one found.
- **`describe('audit log retention')`** – Two cases:
  - *defaults to 90 days when the variable is unset* – sets `NODE_AUDIT_RETENTION_DAYS` to `undefined`, expects `90 * 86400` seconds.
  - *honours a configured retention* – sets the variable to `'30'`, expects `30 * 86400` seconds.
- **`afterEach`** – Calls `jest.resetModules()` to prevent cross-test module caching.

## Relationships

- **`src/modules/audit-logs/model.ts`** – The module under test. `loadSchema` re-imports it via a dynamic `import()` after `jest.resetModules()`, so the import-time read of `NODE_AUDIT_RETENTION_DAYS` runs against the staged environment.
- **`tests/support/environment.ts`** – Provides `setEnvironment`, which is called before each assertion to stage the desired variable state for the subsequent re-import.

## Notes

- The `jest.resetModules()` + dynamic `import()` pattern is **required here** because the TTL value is baked in at module-evaluation time, not lazily resolved. A simple re-render or re-query would not re-read the variable.
- `ttlSeconds` uses a `find` over all indexes rather than a direct property lookup, because the retention index is not the only index the schema declares.
- The environment variable is read as a **string** (e.g. `'30'`) and is expected to be interpreted as days on the model side.
