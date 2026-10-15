---
source: src/modules/feedback/config.ts
sha256: a3df61c326fb63d2c8b06ba41c425b3028786e076287e856d2877fea9cacd076
generated_at: 2026-10-15T10:31:40.035885+00:00
model: ollama:qwen3.8:27b
---

# src/modules/feedback/config.ts

## Purpose

Declares the operator-facing configuration schema for the feedback module: the notification email address, ticket retention period, and whether tickets are included in data exports. It centralises these values so the rest of the feedback feature can read them through a typed shape rather than hard-coding environment-variable lookups.

## Key elements

- **`feedbackConfig`** (exported const) — A config object created via `defineConfig` with the name `'feedback'`. Its `shape` defines three entries:
  - `NODE_CONTACT_NOTIFY_EMAIL` — free-form `text()` field; the email address that receives ticket notifications.
  - `NODE_FEEDBACK_RETENTION_DAYS` — `int` field, default **730** (2 years), minimum **1**.
  - `NODE_EXPORT_INCLUDE_FEEDBACK` — boolean `flag` field, default **false**; controls ticket inclusion in data exports.

## Relationships

- **`src/infrastructure/config/define.ts`** — provides `defineConfig`, the factory that wraps the shape into a named, validated config object.
- **`src/infrastructure/config/fields.ts`** — provides the `text`, `int`, and `flag` field builders used to declare each shape entry.
- **`src/modules/feedback/service.ts`** — consumes `feedbackConfig` to read retention, notification, and export-inclusion values at runtime.
- **`src/modules/feedback/model.ts`** — references the config when mapping ticket metadata (e.g. retention window).
- **`src/modules/feedback/module.ts`** — registers or wires `feedbackConfig` into the broader module lifecycle.

## Notes

- Retention default of 730 days equals two years; the `min: 1` guard means the field is effectively "at least one day," so a value of `0` is invalid by design.
- `NODE_EXPORT_INCLUDE_FEEDBACK` defaults to `false`, meaning tickets are **excluded** from exports unless explicitly opted in.
- The `@module` JSDoc tag marks this as a side-effect-free module (no `export default`); consumers import the named `feedbackConfig` directly.
