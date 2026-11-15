---
source: src/modules/audit-logs/config.ts
sha256: 01c4b5147fdc4392779ad60dcc2c7efca0815ec32c6dbd1e3c0531de0265b288
generated_at: 2026-11-14T19:23:47.190762+00:00
model: ollama:qwen3.8:27b
---

# src/modules/audit-logs/config.ts

## Purpose

Defines the sole configuration knob for the audit-logs module: how many days an audit entry is retained before it is eligible for cleanup. It exists to centralize that single value so it can be validated at startup and read uniformly by the rest of the module.

## Key elements

- **`auditLogsConfig`** (exported const) — the module's config object built via `defineConfig`. Contains:
  - `name: 'audit-logs'` — namespace key used by the config infrastructure.
  - `shape.NODE_AUDIT_RETENTION_DAYS` — an integer field (default `180`, minimum `1`) representing retention in days.

## Relationships

- **`src/infrastructure/config/define.ts`** — provides the `defineConfig` helper that creates the typed config object and registers the `name` / `shape` structure.
- **`src/infrastructure/config/fields.ts`** — provides the `int` field descriptor used to constrain `NODE_AUDIT_RETENTION_DAYS` (type, default, min).
- **`src/modules/audit-logs/module.ts`** — consumes `auditLogsConfig` to wire the retention value into the module's dependency graph.
- **`src/modules/audit-logs/service.ts`** — reads the resolved retention value to determine entry lifetime.
- **`src/modules/audit-logs/model.ts`** — likely pairs with the retention setting for entity definitions or TTL annotations.
- **`src/modules/audit-logs/tests/integration/repository.test.ts`** — exercises behavior that depends on the configured retention window.

## Notes

- This is intentionally the *only* knob in the audit-logs config. Adding a new tunable here means updating `docs/tools/configuration.md` (referenced in the module doc comment).
- The field name prefix `NODE_` follows the project's convention for environment-variable-backed config keys; the runtime reads it from the environment under that name.
