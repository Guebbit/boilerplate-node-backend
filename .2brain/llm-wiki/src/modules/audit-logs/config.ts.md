---
source: src/modules/audit-logs/config.ts
source_sha256: 5f57a1aa92bc75ed17ebb21190150c73305e32b4206461ca1c4c89e224d25afe
context_sha256: 1f4024878a921ffe6bcc49dfb150131032f0aea377e9cb5fba94f63d856edc48
generated_at: 2026-11-22T04:26:10.324931+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/audit-logs/config.ts

## Purpose
Declares the configuration for the audit-logs module. Its only setting is how long an audit entry is retained, expressed in days.

## Key elements
- `auditLogsConfig`: the module's config, created with `defineConfig` under the name `'audit-logs'`. Its shape has one field:
  - `NODE_AUDIT_RETENTION_DAYS`: an `int` field with default `180` and minimum `1`.

## Relationships
- `src/infrastructure/config/define.ts`: supplies `defineConfig`, which builds `auditLogsConfig`.
- `src/infrastructure/config/fields.ts`: supplies the `int` field helper used to declare the retention setting.
- `src/modules/audit-logs/model.ts`, `src/modules/audit-logs/module.ts`, `src/modules/audit-logs/service.ts` and `src/modules/audit-logs/tests/integration/repository.test.ts` are graph neighbors of this file. The file itself imports nothing from them, so this page does not describe how they use the config.

## Notes
- The header comment points to `docs/operate/health-checks.md#who-owns-what` for how config ownership is documented.
- The environment variable is named `NODE_AUDIT_RETENTION_DAYS`. Values below 1 are excluded by `min: 1`.
