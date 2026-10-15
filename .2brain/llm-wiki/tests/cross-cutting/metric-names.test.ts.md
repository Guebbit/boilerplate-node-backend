---
source: tests/cross-cutting/metric-names.test.ts
sha256: ac019fa76ad64887a0849f2a7ba33d40db94fbb2f9185ae2e3d7b33baaac84eb
generated_at: 2026-10-15T12:38:42.050569+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/metric-names.test.ts

## Purpose

Validates that metric names declared in each module's `metrics.ts` are consistent with the string literals the observability overview controller reads, and conform to Prometheus naming rules. Because importing the modules would boot Mongoose and trigger collection aggregations, the test reads **source text** with regex instead of exercising the runtime, making it a compile-free consistency check between the declaration sites and the single consumer that references names by string.

## Key elements

- **`withoutComments(source)`** – Strips block and line comments so a note between `new Counter({` and `name:` cannot hide a declaration from the regex sweep.
- **`metricFiles()`** – Discovers every `src/modules/<name>/metrics.ts` on disk, plus the infrastructure-owned `command-metrics.ts`.
- **`declarations()`** – Extracts `{ module, name, kind, help }` from each file via a single combined regex, keeping the three fields attached to one metric.
- **`nameAssignments()`** – Lists every `name:` line (literal or computed) to support the "must be a literal" assertion.
- **`namesReadByLiteral()`** – Pulls the metric-name strings from `readCounter('…')` calls in the overview controller.
- **`shopMetricNames()`** – Reads the `SHOP_METRIC_NAMES` array so shop-module metrics can be treated as an all-or-nothing group.
- **`describe('metric names')`** – Seven cases: canary (sweep isn't empty), name resolution against declarations, literal-only names, shared-registry registration count, `snake_case` validity, `_total` suffix on Counters, and minimum help-text length.

## Relationships

- **`tests/support/paths.ts`** — Imported as `@tests/paths`; supplies `MODULES_ROOT`, the base directory from which all metric files and the overview controller path are resolved.
- **`tests/unit/scripts/mutation/ci/waves.test.ts`** — Graph-level neighbor (same cross-cutting test suite); no direct import or code interaction visible in this file.

## Notes

- **Comment stripping is load-bearing.** A regex that skips `withoutComments` would miss any metric whose `name:` field is preceded by a block comment (e.g. the naming-convention note in `account/metrics.ts`).
- **Registration check is count-based.** It compares the number of `new <Kind>(` occurrences against `registers: [metricsRegistry]` occurrences per file. It catches a metric registered on a private registry but cannot detect a metric registered on the shared registry with a *different* name than the one passed to the constructor.
- **Shop metrics are all-or-nothing.** If none of `SHOP_METRIC_NAMES` are declared, they are excluded from the resolution check; if any one is declared, all must be. This accommodates environments where the shop module is absent.
- **The canary test is not optional.** Every other case iterates over the result of `declarations()` or `namesReadByLiteral()`; if a refactor renames the controller or changes the call shape, those arrays go empty and the checks pass vacuously. The canary guards against that.
