---
source: shared/rules/schemas/semantic-log-names.schema.json
sha256: 364f423fc1d6a925202ca1050d9ae35b13d2912a090c244364d22a88715bf547
generated_at: 2026-11-08T03:11:30.205639+00:00
model: ollama:qwen3.8:27b
---

# shared/rules/schemas/semantic-log-names.schema.json

## Purpose

JSON Schema (draft 2020-12) that validates the shape of a `semanticLogNames` mapping — a dictionary of log-name identifiers to display strings. It enforces that keys are lowercase-prefixed camelCase-style identifiers and values are non-empty strings, while rejecting any extra top-level properties.

## Key elements

- **Top-level object** — requires exactly one property (`semanticLogNames`) and forbids additional properties.
- **`semanticLogNames`** — an open object whose keys are constrained by `propertyNames.pattern: ^[a-z][A-Za-z0-9]*$` (must start with a lowercase letter, then alphanumeric only) and whose values must be strings with `minLength: 1`.
- **`additionalProperties` (on `semanticLogNames`)** — allows any number of valid key/value pairs (open vocabulary), but each value is type-checked as a non-empty string.

## Notes

- The key pattern `^[a-z][A-Za-z0-9]*$` forbids hyphens, underscores, leading digits, and uppercase-first names. If a new log name uses any of those, the schema will reject the config.
- Because the top level has `"additionalProperties": false`, wrapping this mapping in any extra metadata fields (e.g. a `"version"` key) will fail validation.
- No `$id`, `$ref`, or `definitions` are used; the schema is fully self-contained and has no graph neighbors.
