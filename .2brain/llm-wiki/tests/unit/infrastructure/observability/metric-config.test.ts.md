---
source: tests/unit/infrastructure/observability/metric-config.test.ts
sha256: cb1f52efd0fd82841f83fcd15e5c7dabc5858361eb964e7ba90cf9c2e9c1bef0
generated_at: 2026-11-08T10:20:56.916625+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/observability/metric-config.test.ts

## Purpose

Unit tests for the metric-configuration helpers in `metric-config.ts`. Verifies that the conversion from internal metric data to prom-client constructor options copies only the fields prom-client understands, omits optional fields when absent, and performs defensive copies of array values (so callers can't mutate shared readonly arrays).

## Key elements

- **`describe('metric configuration helpers')`** — single test suite covering all three exported helpers.
- **`counterConfig` test** — asserts the result contains exactly `name`, `help`, `labelNames` (no `kind` or other internal fields leak through).
- **`gaugeConfig` test** — asserts `labelNames` is absent from the output when the source object has no labels.
- **`histogramConfig` test** — asserts `buckets` in the result is a fresh mutable array (`not.toBe(buckets)`) while preserving the same values.

## Relationships

- **`src/infrastructure/observability/metric-config.ts`** — the sole import; this file exercises `counterConfig`, `gaugeConfig`, and `histogramConfig` by calling them with synthetic inputs and asserting on the returned plain objects.

## Notes

- Test data is declared with `as const` to simulate the readonly arrays the production types carry, ensuring the helpers' defensive-copy behavior is actually exercised.
- The `kind` field present in the source data but absent from the expected output is the concrete check that "fields prom-client does not know" are stripped, as the file's doc comment promises.
