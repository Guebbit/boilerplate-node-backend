---
source: src/infrastructure/config/shared-rules/metrics.ts
sha256: 3977f1a75eeedefaea3bd23bc87f081ccbe086c54847c8a9592414b1cc8cf022
generated_at: 2026-11-08T03:27:09.722003+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/config/shared-rules/metrics.ts

## Purpose

Zod schemas that validate the `shared/rules/metrics.yaml` file, which declaratively declares the name, kind, help text, labels, and buckets of every infrastructure metric. It keeps the *identity* of metrics (the parts dashboards and alert rules reference) in data while leaving recording and `collect()` hooks in code, giving both a single typed source of truth.

## Key elements

- **`metricDataSchema`** – Zod strict-object schema for one metric entry. Fields: `name` (Prometheus snake_case), `kind` (`counter` | `gauge` | `histogram`), `help` (≥ 15 chars), optional `labelNames`, optional `buckets`. Two refinements enforce: (a) buckets exist *iff* kind is `histogram`, (b) `counter` names end in `_total`.
- **`metricsBlockSchema`** – `z.record` keyed by camelCase constant names, each value matching `metricDataSchema`.
- **`metricsSchema`** – Top-level strict object `{ metrics: metricsBlockSchema }` with an additional refinement that all Prometheus `name` values across the block are unique.

## Relationships

- **`src/infrastructure/config/shared-rules/registry.ts`** – Registers and loads these schemas so that the YAML file is parsed and validated at startup against `metricsSchema`.
- **`tests/unit/infrastructure/config/ops-rules-schemas.test.ts`** – Unit-tests the three exported schemas, covering happy paths and the refinement edge cases (non-counter `_total`, missing buckets on histogram, duplicate names, extra keys).

## Notes

- **Strict objects throughout** – any key not listed in the schema is rejected; the module doc explicitly calls this out as a design choice ("an extra key is a typo, or a behaviour that belongs in code").
- **Naming duality** – YAML keys are camelCase (matching code constants), while the `name` field inside each entry is Prometheus snake_case. Don't confuse the two.
- **`_total` is one-directional** – every counter *must* end in `_total`, but a gauge *may* legitimately carry that suffix; the refinement only constrains counters.
- **Relative imports only** – the module doc references `load.ts` for the import-path convention; avoid absolute or package-style imports in this directory.
- **`help` minimum of 15 chars** – a soft guard against placeholder strings like `"TODO"`; no semantic validation beyond length.
