---
source: src/modules/audit-logs/config.ts
sha256: 18f5af712be27bc19ec2b42af63d5fc3e7a92b18081417c2c95cbbe2606e1c5d
generated_at: 2026-10-15T10:21:40.826217+00:00
model: ollama:qwen3.8:27b
---

# src/modules/audit-logs/config.ts

## Purpose
Defines the single configuration surface for the audit-logs module: the retention period (in days) for audit entries. It declares the config shape so the rest of the module and the global configuration loader can validate and supply the value at startup.

## Key elements
- **`auditLogsConfig`** (exported const) — The module's config object, created via `defineConfig`. Its shape exposes one field:
  - `NODE_AUDIT_RETENTION_DAYS` — integer, `default: 90`, `min: 1`. Controls how many days an audit-log entry is retained before it can be purged.
- Config name registered as `'audit-logs'`, which is the key used when the global config system namespaces this module's values.

## Relationships
- **`src/infrastructure/config/define.ts`** — Provides `defineConfig`, the factory used to build the typed config object.
- **`src/infrastructure/config/fields.ts`** — Provides the `int` field descriptor (validation: integer, min, default) used for `NODE_AUDIT_RETENTION_DAYS`.
- **`src/modules/audit-logs/model.ts`** — Consumes `auditLogsConfig` to shape the audit-log entry model.
- **`src/modules/audit-logs/module.ts`** — Registers `auditLogsConfig` with the module system so it participates in the global configuration lifecycle.

## Notes
- The config intentionally has exactly one field. Adding more keys here changes the public surface of the `audit-logs` config namespace — keep additions deliberate.
- `min: 1` enforces a positive retention; there is no max constraint visible in this file.
- The field name follows the `NODE_` prefix convention (likely to avoid collisions in a flat `NODE_*` environment-variable schema).
