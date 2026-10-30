---
source: shared/rules/schemas/metrics.schema.json
sha256: f5e4e80b9aa01bed20dd4edda0d7549c5b3bdf3f5cb64441986fce6a6df91b8e
generated_at: 2026-10-29T01:48:44.375784+00:00
model: ollama:qwen3.8:27b
---

# shared/rules/schemas/metrics.schema.json

## Purpose

JSON Schema (draft 2020-12) that validates a metrics definition file. It enforces the structure, naming conventions, and allowed field set for a collection of Prometheus-style metrics so that metric declarations across the codebase conform to a single canonical shape.

## Key elements

- **`metrics`** (required, top-level object) – The single entry point. Keys must match `^[a-z][A-Za-z0-9]*$` (lowercase-start identifier, camelCase permitted).
- **`additionalProperties`** (per-metric object) – Schema for each metric entry. Requires `name`, `kind`, and `help`; disallows any other fields.
- **`name`** – Metric name; must be snake_case (`^[a-z][a-z0-9]*(_[a-z0-9]+)*$`).
- **`kind`** – One of `"counter"`, `"gauge"`, `"histogram"` (Prometheus metric types).
- **`help`** – Human-readable description; minimum length 15 characters.
- **`labelNames`** (optional) – Array of ≥ 1 label names, each matching `^[a-z][a-z0-9_]*$`.
- **`buckets`** (optional) – Array of ≥ 1 numbers, all strictly > 0 (for histogram bucket boundaries).

## Relationships

No graph neighbors are registered for this file. It is a standalone schema definition with no code dependencies.

## Notes

- `additionalProperties: false` is set at **three** levels (root, the `metrics` value, and each individual metric object), so any unrecognized key anywhere in the document causes a validation failure.
- The `buckets` field has no `kind` restriction in the schema itself; a consumer is expected to only attach it to `histogram` metrics.
- `help` enforces a 15-character minimum to discourage empty or trivial descriptions.
- Label name pattern (`^[a-z][a-z0-9_]*$`) differs slightly from the metric name pattern (no uppercase allowed), matching Prometheus label conventions.
