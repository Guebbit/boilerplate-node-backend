---
source: src/infrastructure/config/shared-rules/audit-actions.ts
sha256: d085b4be61d6ab5a6c8e363b3599c4e4d3fd6f2f8e2db107a102235e05f40fca
generated_at: 2026-11-14T17:56:44.861468+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/config/shared-rules/audit-actions.ts

## Purpose

Defines the Zod validation schema for `shared/rules/audit-actions.yaml`, which holds audit action identifiers that are not scoped to any specific module. It ensures the YAML file contains only well-formed `security.*` dotted strings.

## Key elements

- **`auditActionsSchema`** — A `z.strictObject` (rejecting any unexpected top-level keys) with a single key `actions`, whose value is validated by `keyedListSchema` constrained by the regex `/^security(\.[a-z][\d_a-z]*){1,3}$/`.
- **`keyedListSchema`** (imported) — Reused from `./generate-spec` to enforce the list-element format against the provided regex.

## Relationships

- **`./generate-spec`** — Provides `keyedListSchema`, the shared helper that wraps a regex into a Zod list-element schema. This file is the consumer.

## Notes

- The doc-comment mandates **relative imports only**, pointing to `load.ts` for the convention. Avoid adding bare or alias imports here.
- The regex allows up to **three** additional dot-separated segments after the `security` prefix (e.g. `security.auth.login.fail`), each starting with a lowercase letter and containing only `[a-z0-9_]`.
- The comment "actions that belong to no module" implies this file is the *fallback/global* bucket; module-scoped audit actions presumably live elsewhere.
