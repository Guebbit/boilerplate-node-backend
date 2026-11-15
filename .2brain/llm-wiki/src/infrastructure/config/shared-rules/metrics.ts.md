---
source: src/infrastructure/config/shared-rules/metrics.ts
sha256: cf53b385f09823bce2df4b8bce627f034c29ab5aed2010c9d4a3a3b0c965fe59
generated_at: 2026-11-14T17:58:21.337832+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/config/shared-rules/metrics.ts

## Purpose

Defines the Zod validation schema for `shared/rules/metrics.yaml`, which declaratively captures the metadata (name, kind, help, label names, histogram buckets) of every infrastructure metric. Dashboards and alert rules depend on these names, so the data lives in the YAML twin; the recording logic and `collect()` hooks remain in code. This file enforces that the YAML is structurally correct at load time.

## Key elements

- **`metricDataSchema`** (internal) — Validates a single metric entry. Enforces: snake_case Prometheus name, kind is `counter | gauge | histogram`, `help` ≥ 15 chars, optional `labelNames` (each a valid identifier), optional `buckets` (positive ascending numbers). Two refinements: buckets exist *iff* kind is `histogram`; a counter's name must end in `_total`.
- **`metricsBlockSchema`** (internal) — `z.record` keyed by camelCase constant names, each value validated by `metricDataSchema`.
- **`metricsSchema`** (exported) — Top-level strict object `{ metrics: metricsBlockSchema }` with a cross-field refinement that no two metrics share the same Prometheus name.

## Relationships

- **`src/infrastructure/config/shared-rules/registry.ts`** — Sits on the same dependency path; imports `metricsSchema` to validate parsed rule data during registry assembly.
- **`tests/unit/infrastructure/config/ops-rules-schemas.test.ts`** — Exercises `metricsSchema` (and its sub-schemas) with valid and invalid fixtures to pin the contract.

## Notes

- All imports must be **relative** paths (no bare/aliased specifiers); see `load.ts` for the rationale.
- The `_total` counter-suffix rule is asymmetric: a gauge *may* legitimately end in `_total` (observed in the wild), so only counters are constrained.
- `labelNames` is intentionally optional (`.optional()`) rather than defaulting to `[]`; downstream code must guard for its absence.
- The schema is `strictObject` throughout — any unexpected key is a rejected input, not silently ignored.
