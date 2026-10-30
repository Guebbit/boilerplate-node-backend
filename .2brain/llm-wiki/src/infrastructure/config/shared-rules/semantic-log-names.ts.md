---
source: src/infrastructure/config/shared-rules/semantic-log-names.ts
sha256: 9ca60ad1c7f6cd6923600ef5f9e61c32a8591d815d741b53c57eb5f49bfdf792
generated_at: 2026-10-29T02:00:33.751393+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/config/shared-rules/semantic-log-names.ts

## Purpose

Defines the Zod validation schema for `shared/rules/semantic-log-names.yaml`. The YAML file maps camelCase code-level field names to the actual field names used in structured log lines; this module provides the type-level contract so that any code reading that YAML gets immediate runtime validation.

## Key elements

- **`semanticLogNamesSchema`** (exported, Zod `strictObject`): Validates the top-level shape of the YAML. Contains a single key, `semanticLogNames`, whose value is a `z.record` mapping:
  - **Keys** — code field names; must match `/^[a-z][A-Za-z0-9]*$/` (lowercase-start camelCase/kebab, no leading digit, no hyphens enforced by the regex).
  - **Values** — the log-line field name; must be a non-empty string.
  - The strict-object wrapper rejects any unexpected top-level keys.

## Relationships

- **`src/infrastructure/config/shared-rules/registry.ts`** — The registry imports and exposes `semanticLogNamesSchema` alongside other shared-rule schemas, making it available to consumers that load and validate the full set of shared rules in one pass.

## Notes

- The file doc comment states "Relative imports only" and points to `load.ts` for context; this module itself has no runtime imports beyond `zod`.
- The key regex enforces camelCase starting with a lowercase letter but permits uppercase and digits thereafter (e.g. `requestId` is valid; `RequestID` is not).
- Because the object is `strict`, adding a new top-level key to the YAML without updating this schema will fail validation.
