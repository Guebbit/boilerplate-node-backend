---
source: src/modules/audit-logs/tests/unit/retention.test.ts
sha256: fc904671480b2d4482e7ceb459022b54353488280cec1533bfd291b688a8f611
generated_at: 2026-09-23T18:28:12.867064+00:00
model: ollama:qwen3.8:27b
---

# src/modules/audit-logs/tests/unit/retention.test.ts

## Purpose

Unit test that verifies the audit-log collection's TTL index is configured with the correct `expireAfterSeconds` value derived from the `NODE_AUDIT_RETENTION_DAYS` environment variable, including the 90-day default used when the variable is unset.

## Key elements

- **`loadSchema`** – Resets the Jest module registry and dynamically re-imports `@modules/audit-logs/model`, returning `auditLogSchema`. Because `model.ts` reads the env variable *at import time*, re-importing is the only way to re-evaluate it per test.
- **`ttlSeconds`** – Extracts the `expireAfterSeconds` value from whichever index in the schema's `indexes()` array declares one.
- **`describe('audit log retention')`** – Contains two cases: default (90 days) and explicit override (`'30'`). An `afterEach` hook restores the original env state and resets modules between tests.

## Relationships

- **`src/modules/audit-logs/model.ts`** – The sole import under test. The test exercises the import-time side-effect in that module where `NODE_AUDIT_RETENTION_DAYS` is read and used to declare a TTL index on `auditLogSchema`. No other runtime interaction exists.

## Notes

- The env variable is read once at module load (import time), not lazily. This is why `loadSchema` must call `jest.resetModules()` before each dynamic `import()`; a plain static import would cache the first evaluation and make the second test see the first test's value.
- The 90-day default is the *production* path (i.e., every deployment that does not set the variable), so the "default" test is arguably the more critical one.
- `ttlSeconds` walks `schema.indexes()` and picks the first entry with a defined `expireAfterSeconds`; it does not validate that the value belongs to a TTL index specifically.
