---
source: shared/rules/schemas/semantic-log-names.schema.json
sha256: 364f423fc1d6a925202ca1050d9ae35b13d2912a090c244364d22a88715bf547
generated_at: 2026-10-29T01:49:04.676069+00:00
model: ollama:qwen3.8:27b
---

# shared/rules/schemas/semantic-log-names.schema.json

## Purpose

A JSON Schema (draft 2020-12) that validates an object exposing a single required `semanticLogNames` map. It enforces the key naming convention and value shape for semantic log name entries, serving as the machine-checkable contract for any configuration or manifest file that declares those names.

## Key elements

- **Root object** — `additionalProperties: false` at the top level, so the only allowed key is `semanticLogNames`.
- **`semanticLogNames` (object)** — the map of log-name entries. Its keys must match the pattern `^[a-z][A-Za-z0-9]*$` (lowercase first char, then alphanumeric), and every value must be a non-empty string (`minLength: 1`).
- **`required: ["semanticLogNames"]`** — the property is mandatory; an empty `{}` would fail validation.

## Relationships

No graph neighbors were reported for this file.

## Notes

- The `propertyNames` pattern permits mixed case *after* the first character (e.g. `myLogName` is valid, but `MyLogName` or `_log` are not). It is effectively a "lowerCamelCase / lower-alphanumeric" constraint, not strict kebab-case.
- The schema constrains the **keys** of `semanticLogNames` via `propertyNames`; the **values** are only required to be non-empty strings. There is no enum or pattern on the values themselves.
- Because `additionalProperties` is `false` at both levels, any extra top-level key or extra log-name entry outside the map shape will cause a validation error.
