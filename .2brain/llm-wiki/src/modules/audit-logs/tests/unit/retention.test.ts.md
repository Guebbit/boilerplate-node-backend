---
source: src/modules/audit-logs/tests/unit/retention.test.ts
sha256: 35119fe2cc393aafee2e3e4e1272e193fa1e35252e14ceea839980a80cb8700b
generated_at: 2026-11-14T19:26:21.436969+00:00
model: ollama:qwen3.8:27b
---

# src/modules/audit-logs/tests/unit/retention.test.ts

## Purpose

Unit test that verifies the TTL retention value baked into the audit-log collection's index at module import time. Because the retention is read from `NODE_AUDIT_RETENTION_DAYS` during import (not at query time), the test must simulate a fresh startup to observe the resulting `expireAfterSeconds`.

## Key elements

- **`loadSchema`** – Resets the Jest module registry, dynamically re-imports `@modules/audit-logs/model`, and returns `auditLogSchema`. This forces the import-time env read to execute again under controlled conditions.
- **`ttlSeconds`** – Extracts the `expireAfterSeconds` value from the schema's index declarations by scanning for a non-`undefined` TTL option.
- **"defaults to 180 days when the variable is unset"** – Asserts that with no env var set, the index is declared with `180 * 86400` seconds.
- **"honours a configured retention"** – Asserts that setting `NODE_AUDIT_RETENTION_DAYS=30` yields `30 * 86400` seconds.
- **`afterEach`** – Calls `jest.resetModules()` so each test starts from a clean module registry.

## Relationships

- **`src/modules/audit-logs/model.ts`** – The module under test. After a `jest.resetModules()` call, the test dynamically imports it to obtain `auditLogSchema` and read the `expireAfterSeconds` value from its index declarations.
- **`tests/support/environment.ts`** – Supplies `setEnvironment`, used to set or clear `NODE_AUDIT_RETENTION_DAYS` before the schema module is imported.

## Notes

- The import-time read is the central reason for the `jest.resetModules()` + dynamic-import pattern; a plain static import would capture the value once and make the second test see the first test's configuration.
- The test asserts the *index declaration* only. It does not exercise actual document expiry or any runtime query path.
- Only the default branch and one explicit value are covered; there is no test for invalid, zero, or negative inputs to `NODE_AUDIT_RETENTION_DAYS`.
