---
source: src/modules/audit-logs/tests/unit/retention.test.ts
sha256: a1c65b22ff67fd8c08b89d791e3a8d37f1d3f24109cbb01aebef4b315f051368
generated_at: 2026-10-14T15:07:01.777167+00:00
model: ollama:qwen3.8:27b
---

# src/modules/audit-logs/tests/unit/retention.test.ts

## Purpose

Unit test that verifies the TTL index declared on the audit log collection resolves to the correct `expireAfterSeconds` value, both for the default (90 days) and a caller-supplied retention period. Because the TTL is baked in at module-load time from an environment variable, the tests must force a fresh import to exercise different values.

## Key elements

- **`loadSchema`** — Calls `jest.resetModules()` then dynamically imports `@modules/audit-logs/model` so the import-time env read re-executes. Returns the `auditLogSchema`.
- **`ttlSeconds`** — Extracts the first non-undefined `expireAfterSeconds` from the schema's `indexes()` declarations.
- **`'defaults to 90 days when the variable is unset'`** — Asserts the index TTL equals `90 * 86400` when `NODE_AUDIT_RETENTION_DAYS` is not set.
- **`'honours a configured retention'`** — Asserts the index TTL equals `30 * 86400` when the variable is set to `'30'`.

## Relationships

- **`src/modules/audit-logs/model.ts`** — The unit under test. The test reads `auditLogSchema.indexes()` to inspect the declared TTL index without a live database.
- **`tests/support/environment.ts`** — Provides `setEnvironment`, used to set/clear `NODE_AUDIT_RETENTION_DAYS` before each schema re-import.

## Notes

- The entire test strategy hinges on the fact that `model.ts` reads the env var **once at import time**. Without `jest.resetModules()` the second test case would see the value captured during the first import. This is why `loadSchema` exists as a dedicated helper rather than a plain static import.
- No database or network is required; assertions are made purely against the Mongoose schema object's index metadata.
