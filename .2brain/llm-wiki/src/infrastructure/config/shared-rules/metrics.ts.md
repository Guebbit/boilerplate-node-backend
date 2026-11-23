---
source: src/infrastructure/config/shared-rules/metrics.ts
source_sha256: cf53b385f09823bce2df4b8bce627f034c29ab5aed2010c9d4a3a3b0c965fe59
context_sha256: f618544957dfde5821e1c9b775cfb10e9fb92d5294521a3fb3c5e28ce31b1ede
generated_at: 2026-11-22T02:45:51.472634+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/config/shared-rules/metrics.ts

## Purpose
Defines the zod schema for `shared/rules/metrics.yaml`, which lists every infrastructure metric (name, kind, help text, labels, histogram buckets). Dashboards and alert rules depend on these names, so they are kept as data that a twin implementation can copy. Recording and `collect()` hooks stay in code.

## Key elements
- `metricsSchema` (exported): a strict object `{ metrics: <block> }`. It adds a refinement that rejects two metrics sharing the same `name` ("two metrics share a name").
- `metricsBlockSchema` (internal): a record keyed by the camelCase name of the code's constant (`/^[a-z][A-Za-z0-9]*$/`), with each value validated by `metricDataSchema`.
- `metricDataSchema` (internal): a strict object with these fields:
  - `name`: snake_case Prometheus name.
  - `kind`: `counter`, `gauge` or `histogram`.
  - `help`: string of at least 15 characters.
  - `labelNames`: optional, non-empty array of lowercase label names.
  - `buckets`: optional, non-empty array of positive numbers.
  - Two refinements apply to every metric. Only histograms may have `buckets`, and every histogram must have them. A counter's name must end in `_total`.

## Relationships
- Imports only `zod`. The header notes that this module uses relative imports only.
- `registry.ts` and `tests/unit/infrastructure/config/ops-rules-schemas.test.ts` are the listed graph neighbors. The file itself does not import either one, so the exact link is not visible here. By its name, the test is likely to exercise this schema.

## Notes
- Both objects are `strictObject`, so an unknown key fails validation. The comment says an extra key is either a typo or behaviour that belongs in code.
- The `_total` rule runs one way only. Counters must end in `_total`, but a gauge may carry that suffix.
- The `name` regex does not enforce the `_total` suffix itself. That check is a separate refinement on counters.
