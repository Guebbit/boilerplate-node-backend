---
source: src/infrastructure/config/shared-rules/metrics.ts
sha256: 3977f1a75eeedefaea3bd23bc87f081ccbe086c54847c8a9592414b1cc8cf022
generated_at: 2026-10-29T01:59:51.948926+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/config/shared-rules/metrics.ts

## Purpose

Zod schema for `shared/rules/metrics.yaml`. The YAML file holds the *data* side of every infrastructure Prometheus metric (name, kind, help text, label names, histogram buckets) so dashboards and alert rules can reference metric names without importing code. Recording logic and `collect()` hooks stay in TypeScript. This file is the single source of truth for what shape that YAML must take.

## Key elements

- **`metricDataSchema`** – Strict Zod object for one metric entry. Validates `name` (Prometheus snake_case regex), `kind` (`counter` | `gauge` | `histogram`), `help` (≥ 15 chars), optional `labelNames` (array of lowercase identifiers), and optional `buckets` (positive ascending numbers). Two refinements: histogram ⇔ buckets are coupled (exactly one has them, exactly one is undefined), and every counter's `name` must end in `_total`.
- **`metricsBlockSchema`** – `z.record` mapping camelCase keys (matching the code constant name) to `metricDataSchema`. This is the value of the top-level `metrics:` key in the YAML.
- **`metricsSchema`** – Top-level strict object `{ metrics: metricsBlockSchema }` with a refinement that rejects duplicate Prometheus `name` values across all entries.

## Relationships

- **`src/infrastructure/config/shared-rules/registry.ts`** – Sits alongside this file in the same directory and is the natural consumer of these exported schemas (e.g., to parse and validate the YAML at load time).
- **`tests/unit/infrastructure/config/ops-rules-schemas.test.ts`** – Unit-tests the schemas exported here, exercising the refinements and strictness constraints.

## Notes

- **Strict everywhere.** `z.strictObject` on both the metric and the top-level object: an unexpected key fails validation. The intent (stated in the docstring) is that any extra key is either a typo or behaviour that belongs in code, not data.
- **One-way `_total` rule.** Counters *must* end in `_total`; gauges *may* carry the suffix (real-world naming drift). The refinement does not reject `_total` on non-counters.
- **YAML keys vs. metric names.** Record keys are camelCase (e.g. `httpRequestDuration`), while the `name` field is the snake_case Prometheus identifier (e.g. `http_request_duration_seconds`). Don't confuse them when editing the YAML.
- **Relative imports only.** The module docstring defers to `src/infrastructure/config/shared-rules/load.ts` for the import-style convention; this file itself uses only the `zod` package import.
