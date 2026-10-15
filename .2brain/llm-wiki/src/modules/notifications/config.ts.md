---
source: src/modules/notifications/config.ts
sha256: 74b674ae5dba2b108dfca885ea36d0f6c173d5e854e1f74f05ecf04f3bb739ab
generated_at: 2026-10-15T10:49:21.989749+00:00
model: ollama:qwen3.8:27b
---

# src/modules/notifications/config.ts

## Purpose
Declares the notifications module's configuration schema. Currently exposes a single knob — the maximum number of notifications a user can retain — so that the value is centrally defined, validated, and documented rather than scattered across service code.

## Key elements
- **`notificationsConfig`** (export) — The config object created via `defineConfig`. Namespaced under `'notifications'` and exposes one field:
  - `NODE_NOTIFICATIONS_MAX_PER_USER` — An `int` field with `default: 100` and `min: 1`. Controls per-user notification retention.

## Relationships
- **`src/infrastructure/config/define.ts`** — Provides `defineConfig`, the function used to build the typed config object from a name + shape declaration.
- **`src/infrastructure/config/fields.ts`** — Provides the `int` field validator that enforces type, default, and minimum constraint on the single field.
- **`src/modules/notifications/module.ts`** — The module entry point that registers or wires `notificationsConfig` into the app's configuration registry.
- **`src/modules/notifications/services/inbox.ts`** — Consumes `NODE_NOTIFICATIONS_MAX_PER_USER` to enforce the per-user retention limit when reading/writing a user's inbox.

## Notes
- The file intentionally exposes exactly one field; the docblock calls it "the inbox's one knob." If additional settings are needed, they belong here rather than in service-level constants.
- The `NODE_` prefix on the field name signals it is an environment-overridable value (see `docs/tools/configuration.md` referenced in the header).
- `min: 1` means the value can never be zero or negative — a user must always retain at least one notification.
