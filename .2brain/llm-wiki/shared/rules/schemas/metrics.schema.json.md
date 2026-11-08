---
source: shared/rules/schemas/metrics.schema.json
sha256: f5e4e80b9aa01bed20dd4edda0d7549c5b3bdf3f5cb64441986fce6a6df91b8e
generated_at: 2026-11-08T03:11:09.185163+00:00
model: ollama:qwen3.8:27b
---

# shared/rules/schemas/metrics.schema.json

## Purpose

A JSON Schema (draft 2020-12) that validates metric-definition objects. It enforces a strict, closed shape for a `metrics` map so that any file declaring metrics conforms to a single, predictable contract (naming conventions, allowed kinds, required fields).

## Key elements

- **Top-level object** – requires exactly one key, `metrics`; no other keys are permitted (`additionalProperties: false`).
- **`metrics` map** – keys must be camelCase (`^[a-z][A-Za-z0-9]*$`). Each value is a metric descriptor.
- **Metric descriptor (per-key object)** – closed object (`additionalProperties: false`) with:
  - `name` *(required)* – snake_case identifier string.
  - `kind` *(required)* – one of `"counter"`, `"gauge"`, `"histogram"`.
  - `help` *(required)* – human-readable description, minimum 15 characters.
  - `labelNames` *(optional)* – non-empty array of snake_case label strings.
  - `buckets` *(optional)* – non-empty array of positive numbers.

## Relationships

No graph neighbors are recorded for this file.

## Notes

- Naming conventions are intentionally different per level: map keys are **camelCase**, while the metric `name` and every entry in `labelNames` must be **snake_case**. Mixing them up will fail validation.
- The schema is fully closed at every level (`additionalProperties: false`), so adding new fields to a metric descriptor without updating the schema will cause a validation error.
- `buckets` is only meaningful for the `"histogram"` kind, but the schema does not conditionally require it; it remains optional for all kinds.
- `help` enforces `minLength: 15`, effectively requiring a non-trivial description rather than a single word.
