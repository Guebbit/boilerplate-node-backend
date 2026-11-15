---
source: shared/rules/schemas/jobs.generated.schema.json
sha256: 0c47f4aa4c3adc93b3d3915d5eee01224985ba910e44dfee657ea8891e8dcd89
generated_at: 2026-11-08T03:10:54.910758+00:00
model: ollama:qwen3.8:27b
---

# shared/rules/schemas/jobs.generated.schema.json

## Purpose

JSON Schema (draft 2020-12) that validates a top-level configuration object containing named, scheduled jobs. It enforces a strict, closed shape so that any tool or service consuming the job list can rely on a uniform structure without runtime type-checking.

## Key elements

- **Top-level object** – requires a single `jobs` key; rejects any other properties.
- **`jobs` map** – keyed by arbitrary strings; each value is a job definition object with `additionalProperties: false`.
- **`name` (required)** – must match `^(reap|sweep):[a-z0-9]+(-[a-z0-9]+)*$`. Only the `reap:` and `sweep:` prefixes are permitted; the remainder is kebab-case alphanumeric.
- **`schedule` (required)** – a 5-field cron expression (`^[\d*/,-]+(\s+[\d*/,-]+){4}$`), supporting digits, `*`, `/`, `,`, and `-` in each field. No seconds field.
- **`summary` (required)** – non-empty human-readable description (`minLength: 1`).

## Relationships

No graph neighbors are documented for this file. It is a leaf schema consumed by whatever process reads the jobs configuration.

## Notes

- The `propertyNames` constraint on `jobs` (`"type": "string"`) is effectively a no-op since JSON object keys are always strings; it exists to satisfy schema-lint rules rather than to add real validation.
- `additionalProperties: false` appears at **three** levels (root, each job, and implicitly via the closed `properties` list), making this a fully closed schema—any unknown key at any level is a validation failure.
- The name pattern hard-codes the allowed job categories (`reap`, `sweep`). Adding a new category requires editing the regex here first.
- The schedule regex accepts only 5 space-separated fields (minute, hour, day-of-month, month, day-of-week). A 6-field cron (with seconds) will **not** validate.
