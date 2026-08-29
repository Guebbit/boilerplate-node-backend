# src/modules/audit-logs/tests/unit/retention.test.ts

## Purpose

Unit test verifying that the audit-log collection's TTL index picks up the retention period from the `NODE_AUDIT_RETENTION_DAYS` environment variable at import time, and that it defaults to 90 days when the variable is absent.

## Key elements

- **`loadSchema`** — Resets the Jest module registry (`jest.resetModules()`) then dynamically re-imports `@modules/audit-logs/model`, returning `auditLogSchema`. This forces the import-time env read to re-execute under the current test's environment.
- **`ttlSeconds(schema)`** — Walks the schema's declared indexes and extracts the first non-undefined `expireAfterSeconds` value (the TTL the index was created with).
- **`describe('audit log retention')`** — Two cases:
  - *defaults to 90 days when the variable is unset* — deletes the env var, asserts TTL = `90 * 24 * 60 * 60` seconds.
  - *honours a configured retention* — sets `NODE_AUDIT_RETENTION_DAYS = '30'`, asserts TTL = `30 * 24 * 60 * 60` seconds.
- **`afterEach`** — Restores the original env value (or deletes the key) and calls `jest.resetModules()` so subsequent tests start from a clean module state.

## Relationships

- **`src/modules/audit-logs/model.ts`** — The module under test. `loadSchema` imports `auditLogSchema` from it; the test inspects the indexes that module declares to confirm the TTL value derived from the environment.

## Notes

- The TTL is read **once at import time** (startup), so the test must re-trigger the import via `resetModules` + dynamic `import`. A plain static import would only capture the value from the first load.
- The env variable is expressed in **days**; the TTL index stores **seconds**. The tests assert the converted value (days × 86 400), not the raw string.
- `ttlSeconds` casts index options to `{ expireAfterSeconds?: number }` rather than importing a typed constant — it assumes the key name without coupling to the model's type exports.
