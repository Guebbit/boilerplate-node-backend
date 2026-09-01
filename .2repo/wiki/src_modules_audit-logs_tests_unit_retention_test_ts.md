# src/modules/audit-logs/tests/unit/retention.test.ts

## Purpose

Unit test verifying that the audit-log collection's TTL index is created with the correct `expireAfterSeconds` value, both when the `NODE_AUDIT_RETENTION_DAYS` environment variable is unset (default) and when it is explicitly configured.

## Key elements

- **`loadSchema()`** — Re-imports `@modules/audit-logs/model` under a fresh Jest module registry (`jest.resetModules()`) so the import-time env read re-executes, then returns `auditLogSchema`.
- **`ttlSeconds(schema)`** — Pulls the `expireAfterSeconds` value out of the first index in `schema.indexes()` that declares one.
- **`describe('audit log retention')`** — Restores the original `NODE_AUDIT_RETENTION_DAYS` env value and resets modules in `afterEach`.
- **Two test cases** — Assert the TTL is `90 * 86400` seconds when the variable is unset, and `30 * 86400` seconds when set to `'30'`.

## Relationships

- **`src/modules/audit-logs/model.ts`** — The module under test. This file dynamically imports it and inspects `auditLogSchema.indexes()` to extract the TTL declaration. The dynamic import (rather than a static one) is what allows `jest.resetModules()` to re-run the model's top-level env read.

## Notes

- The test depends on `auditLogSchema.indexes()` returning an array whose entries are `[name, options]` tuples; the second element must carry `expireAfterSeconds`. If the schema API changes shape, `ttlSeconds` will silently return `undefined`.
- Because the TTL value is read **at import time**, a static `import` in this test would always see the first import's value. The `jest.resetModules()` + dynamic `import` pattern is the workaround and is intentional.
- The env variable name is `NODE_AUDIT_RETENTION_DAYS` (note the `NODE_` prefix, consistent with other env vars in this codebase).
