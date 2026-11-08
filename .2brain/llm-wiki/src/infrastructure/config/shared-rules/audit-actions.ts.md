---
source: src/infrastructure/config/shared-rules/audit-actions.ts
sha256: ab178c46c84a9d4ba799d8ddcbb40e8ba9b3722f9e404904f35f9cf922e94f21
generated_at: 2026-11-08T03:25:44.898729+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/config/shared-rules/audit-actions.ts

## Purpose

Defines the Zod schema (`auditActionsSchema`) that validates the structure of `shared/rules/audit-actions.yaml`—the set of audit actions that are global to the project rather than belonging to any specific module.

## Key elements

- **`auditActionsSchema`** (exported): A `z.strictObject` with a single field `actions`, typed via `keyedListSchema` constrained to the regex `/^security(\.[a-z_]+)+$/`. Keys must start with `security` followed by one or more dot-separated segments of lowercase letters/underscores (e.g. `security.audit.login`).
- **`keyedListSchema`** (imported from `./generate-spec`): Helper that produces a Zod record schema whose keys must match a given pattern; the values are not further validated here.

## Relationships

- **`generate-spec.ts`** — Provides `keyedListSchema`, the sole non-Zod import in this file.
- **`registry.ts`** — Sits in the same `shared-rules` directory; this schema is one of the shared rule definitions that the registry assembles for global (non-module) audit actions.

## Notes

- The file explicitly states it uses **relative imports only**; see `shared-rules/load.ts` for the rationale.
- The regex anchors on `security` as the mandatory prefix—this prefix is what appears in platform-operator alert names, so it must not be changed casually.
- The schema is `strictObject`, meaning any extra top-level key in the YAML file will cause validation to fail.
