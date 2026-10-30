---
source: src/infrastructure/config/shared-rules/audit-actions.ts
sha256: ab178c46c84a9d4ba799d8ddcbb40e8ba9b3722f9e404904f35f9cf922e94f21
generated_at: 2026-10-29T01:58:26.812331+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/config/shared-rules/audit-actions.ts

## Purpose

Defines the Zod schema that validates `shared/rules/audit-actions.yaml`, a configuration file holding audit actions that are not scoped to any specific module. It exists so the YAML file's structure is type-checked at load time.

## Key elements

- **`auditActionsSchema`** — Exported `z.strictObject` with a single key:
  - `actions` — A `keyedListSchema` constrained by the regex `/^security(\.[a-z_]+)+$/`. Values must be dotted `security.*` strings (e.g. `security.audit_action`); the `security` prefix is what surfaces in platform-operator alerts.

## Relationships

- **`./generate-spec`** (`src/infrastructure/config/shared-rules/generate-spec.ts`) — Provides `keyedListSchema`, the generic list helper used to validate the `actions` field here.

## Notes

- The module doc-block explicitly restricts this file to **relative imports only** (consistent with `load.ts` in the same directory). Do not add bare-specifier or cross-boundary imports.
- The schema is `strictObject`, so any extra top-level key in the YAML file will cause a parse failure.
- The regex on `actions` requires at least one dotted segment after `security` (the `+` after the group), so a bare `security` string is invalid.
