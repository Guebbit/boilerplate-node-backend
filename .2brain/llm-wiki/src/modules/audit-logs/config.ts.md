---
source: src/modules/audit-logs/config.ts
sha256: 18f5af712be27bc19ec2b42af63d5fc3e7a92b18081417c2c95cbbe2606e1c5d
generated_at: 2026-11-08T05:07:23.888111+00:00
model: ollama:qwen3.8:27b
---

# src/modules/audit-logs/config.ts

## Purpose

Declares the single configuration knob for the audit-logs module: how many days an audit entry is retained. It uses the project's config-definition infrastructure to expose a typed, validated value (`NODE_AUDIT_RETENTION_DAYS`) that other parts of the module can read.

## Key elements

- **`auditLogsConfig`** (exported const) — the `defineConfig` instance named `"audit-logs"`. Exposes one shape field:
  - `NODE_AUDIT_RETENTION_DAYS` — integer, default `90`, minimum `1`. Represents the retention window for audit-log entries.

## Relationships

- **`src/infrastructure/config/define.ts`** — imports `defineConfig`, the factory used to build the config object with a name and shape.
- **`src/infrastructure/config/fields.ts`** — imports `int`, the field-constructor used to declare the integer type constraint (default + min).
- **`src/modules/audit-logs/module.ts`** — same-module consumer; expected to register or surface `auditLogsConfig` when the module is wired up.
- **`src/modules/audit-logs/model.ts`** — same-module consumer; expected to read the retention value when constructing or querying audit entries.

## Notes

- This file intentionally exposes exactly one value. If you need a new audit-logs setting, add it to the `shape` object here rather than creating a parallel config file.
- The minimum of `1` day means retention can never be zero; a value of `0` would be rejected at config-validation time.
