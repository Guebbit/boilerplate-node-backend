---
source: shared/rules/schemas/metrics.generated.schema.json
source_sha256: f5e4e80b9aa01bed20dd4edda0d7549c5b3bdf3f5cb64441986fce6a6df91b8e
context_sha256: 1db6f1e92515af6467e76d17917651897685b578d8c480dda6db78731674b2a0
generated_at: 2026-11-22T02:27:58.075500+00:00
model: claude-code:claude-sonnet-5-5
---

# shared/rules/schemas/metrics.generated.schema.json

## Purpose
A generated JSON Schema (draft 2020-12) that validates a metrics definition document. It constrains how metrics are declared (naming, kind, help text, labels, histogram buckets) so that malformed definitions are rejected before use.

## Key elements
- **Root object**: requires a single `metrics` property; no other top-level properties are allowed (`additionalProperties: false`).
- **`metrics` map**: keys (`propertyNames`) must be camelCase, matching `^[a-z][A-Za-z0-9]*$`. Each value is a metric definition object.
- **Metric definition fields** (no extra properties allowed):
  - `name` (required): snake_case string, `^[a-z][a-z0-9]*(_[a-z0-9]+)*$`.
  - `kind` (required): one of `counter`, `gauge`, `histogram`.
  - `help` (required): string of at least 15 characters.
  - `labelNames` (optional): non-empty array of strings matching `^[a-z][a-z0-9_]*$`.
  - `buckets` (optional): non-empty array of numbers, each greater than 0 (`exclusiveMinimum: 0`).

## Relationships
No graph neighbors are listed, so no dependencies or consumers are visible from the file itself.

## Notes
- The `.generated` filename suggests the file is produced by tooling. Edit the source it was generated from rather than this file, since manual edits would likely be overwritten. The source is not identified here.
- Two naming conventions apply: the map key is camelCase, while the `name` field is snake_case.
- The schema does not tie `buckets` to `kind`. It permits `buckets` on any kind and does not require it for `histogram`.
- `labelNames` and `buckets` cannot be empty arrays if present (`minItems: 1`).
