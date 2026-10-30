---
source: shared/rules/schemas/jobs.schema.json
sha256: 0c47f4aa4c3adc93b3d3915d5eee01224985ba910e44dfee657ea8891e8dcd89
generated_at: 2026-10-29T01:48:29.893076+00:00
model: ollama:qwen3.8:27b
---

# shared/rules/schemas/jobs.schema.json

## Purpose

A JSON Schema (draft 2020-12) that validates the structure of a jobs configuration object. It enforces that every declared job carries a properly namespaced name, a standard five-field cron schedule, and a non-empty summary, while forbidding any unknown keys at every level.

## Key elements

- **Top-level object** — requires a single `jobs` property; no other properties are allowed (`additionalProperties: false`).
- **`jobs` map** — an object whose keys are arbitrary strings (the job identifiers) and whose values are job definitions.
- **Job definition** (`additionalProperties: false`) — exactly three required fields:
  - **`name`** — string matching `^(reap|sweep):[a-z0-9]+(-[a-z0-9]+)*$`; must be prefixed with `reap:` or `sweep:` followed by a kebab-case identifier.
  - **`schedule`** — string matching a five-field cron expression (`^[\d*/,-]+(\s+[\d*/,-]+){4}$`).
  - **`summary`** — non-empty string (`minLength: 1`).

## Relationships

No graph neighbors. This file is a standalone schema definition with no imports or cross-references to other files in the repository.

## Notes

- The schema uses `propertyNames` (not `patternProperties`) on the `jobs` map, meaning job keys are unrestricted strings — the only constraint is that they are strings. The meaningful naming constraint lives in each job's `name` field.
- The `name` prefix is limited to `reap` or `sweep`; any other namespace (e.g., `build:`) will fail validation.
- The `schedule` pattern only permits the characters `0-9 * / , -` and exactly five whitespace-separated fields. This rejects cron extensions like `@daily`, named months/days, or 6/7-field forms (with seconds or year).
- `additionalProperties: false` is set at **both** the top level and the per-job level, so any extra field anywhere in the document is a validation error.
