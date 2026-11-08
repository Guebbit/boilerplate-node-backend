---
source: src/modules/tasks/config.ts
sha256: a60767343b4367233a3c91af504de350379be85bafbc1a190446ef301c38bdfc
generated_at: 2026-11-08T08:31:19.819412+00:00
model: ollama:qwen3.8:27b
---

# src/modules/tasks/config.ts

## Purpose

Declares the runtime configuration schema for the tasks module. It defines two integer settings — how long a closed task is retained and the SLA window for responding to a contact message — so that operators can override them via environment or config files rather than hard-coding values.

## Key elements

- **`tasksConfig`** (exported const) — A `defineConfig` object named `"tasks"` whose `shape` exposes two fields:
  - `NODE_TASKS_RETENTION_DAYS` — integer, min 1, default 730 (≈ 2 years). Controls how long a closed task is kept.
  - `NODE_TASKS_CONTACT_SLA_HOURS` — integer, min 1, default 48. Controls how soon a contact message is due.

## Relationships

- **`src/infrastructure/config/define.ts`** — Supplies the `defineConfig` factory used to build the typed config object.
- **`src/infrastructure/config/fields.ts`** — Supplies the `int` field descriptor (type, default, min) used for both shape entries.
- **`src/modules/tasks/model.ts`** / **`service.ts`** / **`module.ts`** — Same-module consumers that read `tasksConfig` at runtime to drive task lifecycle and SLA logic.

## Notes

- Field names follow the `NODE_TASKS_*` prefix convention (module-scoped env-style keys). The `defineConfig` call likely maps these to the process environment at load time.
- Defaults are intentionally permissive (730 days, 48 hours); treat them as fallbacks, not targets.
- See `docs/tools/configuration.md` (referenced in the module docblock) for operator-facing documentation on overriding these values.
