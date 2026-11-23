---
source: src/modules/audit-logs/tests/unit/retention.test.ts
source_sha256: 35119fe2cc393aafee2e3e4e1272e193fa1e35252e14ceea839980a80cb8700b
context_sha256: 63bfc9e5ea540ba09cea870d10bcc914adaf767db068026509bc0416dbeb5556
generated_at: 2026-11-22T04:28:50.286662+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/audit-logs/tests/unit/retention.test.ts

## Purpose
Unit test for the TTL retention of the audit-logs collection. The TTL index is declared from an environment variable read at import time, so the test re-imports the model with a fresh module registry for each case. It checks both the default and a configured retention.

## Key elements
- `loadSchema` — calls `jest.resetModules()`, dynamically imports `@modules/audit-logs/model`, and returns `auditLogSchema`. The reset makes the import-time environment read run again.
- `ttlSeconds` — walks `schema.indexes()` and returns the first defined `expireAfterSeconds` option, or `undefined` if no index declares one.
- `describe('audit log retention')` — has an `afterEach` that calls `jest.resetModules()`, plus two cases:
  - Default: with `NODE_AUDIT_RETENTION_DAYS` unset, the TTL is `180 * 24 * 60 * 60` seconds.
  - Configured: with `NODE_AUDIT_RETENTION_DAYS` set to `'30'`, the TTL is `30 * 24 * 60 * 60` seconds.

## Relationships
- `src/modules/audit-logs/model.ts` — the module under test. Its exported `auditLogSchema` is inspected through `indexes()`.
- `tests/support/environment.ts` — supplies `setEnvironment` (imported via the `@tests/environment` alias). The test uses it to set or unset `NODE_AUDIT_RETENTION_DAYS` before each import.

## Notes
- Set the environment variable before calling `loadSchema()`. Because the model reads it at import time, a change made after the import has no effect.
- The default case matters most. The file's header comment says it is what every deployment without the variable actually runs.
