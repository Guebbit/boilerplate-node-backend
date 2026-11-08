---
source: src/infrastructure/config/shared-rules/semantic-log-names.ts
sha256: 9ca60ad1c7f6cd6923600ef5f9e61c32a8591d815d741b53c57eb5f49bfdf792
generated_at: 2026-11-08T03:27:49.316695+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/config/shared-rules/semantic-log-names.ts

## Purpose

Defines the Zod validation schema for the `shared/rules/semantic-log-names.yaml` configuration file. The YAML maps each structured-log field (as named in code, camelCase) to the name that field appears under in emitted log lines. This file exists so the YAML can be parsed and validated at load time rather than discovered at runtime.

## Key elements

- **`semanticLogNamesSchema`** (exported const) — A `z.strictObject` with a single key `semanticLogNames`: a record where keys match `/^[a-z][A-Za-z0-9]*$/` (lowercase-first, alphanumeric only) and values are non-empty strings. `strictObject` rejects any extra top-level keys.

## Relationships

- **`src/infrastructure/config/shared-rules/registry.ts`** — Imports `semanticLogNamesSchema` to register it as one of the shared-rule configs, making it available to the loader/validator pipeline defined alongside `load.ts`.

## Notes

- Key regex does **not** strictly enforce camelCase (e.g. `aB` and `ab` both pass); it only guarantees a lowercase first character and alphanumerics thereafter. Treat "camelCase" in the doc comment as intent, not a hard constraint.
- The module doc comment mandates **relative imports only** (see `load.ts` in the same directory). Do not add package-specifier imports here.
