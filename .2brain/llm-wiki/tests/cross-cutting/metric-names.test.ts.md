---
source: tests/cross-cutting/metric-names.test.ts
sha256: 315f6cb7e7c3bae5a07566d743a76729f4f49d3711cc0b79e0c12005d0e9976c
generated_at: 2026-10-29T06:47:12.215043+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/metric-names.test.ts

## Purpose

Cross-checks that metric names agree across the three places that must: module `metrics.ts` declarations, the overview controller's string-literal reads, and (externally) Prometheus/Grafana dashboards. A rename compiles and passes unit tests but silently breaks dashboards, so this test reads **source text** — not runtime exports — to catch mismatches without booting Mongoose or opening a database.

## Key elements

- **`withoutComments(source)`** — strips block (`/* */`) and line (`//`) comments so they don't hide or confuse regex sweeps.
- **`metricFiles()`** — discovers every `src/modules/<name>/metrics.ts` via `readdirSync`; no hardcoded list.
- **`declarations()`** — extracts `{ module, name, kind, help }` from each module file via a single combined regex, then appends infrastructure metrics from `infrastructureMetricData`.
- **`nameAssignments()`** — collects every `name:` line (literal or computed) for the "must be a literal" check.
- **`namesReadByLiteral()`** — pulls the string arguments of `readCounter('…')` from the overview controller source.
- **`shopMetricNames()`** — extracts the `SHOP_METRIC_NAMES` array literal from the same controller.
- **7 `it` blocks** — canary (non-empty sweeps), name resolution against declarations, literal-only names, shared-registry registration count, `snake_case` format, `_total` suffix on Counters, and minimum help-text length.

## Relationships

- **`src/infrastructure/observability/metrics.generated.ts`** — imported as `infrastructureMetricData`; supplies the infrastructure-level metric names, kinds, and help strings that no single module owns but the overview endpoint still reads by name.
- **`tests/support/paths.ts`** — imported as `MODULES_ROOT`; provides the filesystem root used to discover module metric files and to locate the overview controller.

## Notes

- **Text-reading is the design.** Importing the modules would boot Mongoose and execute aggregation queries. This file deliberately answers "what does the code *say*?" not "what does it *do*?"
- **`withoutComments` is load-bearing.** `account/metrics.ts` has a comment line sitting where the regex expects the first field of a `new Counter({` block; without stripping it, the sweep skips that declaration entirely.
- **Shop metrics are all-or-nothing.** If *any* name in `SHOP_METRIC_NAMES` is declared, all must be; if none is, the entire group is expected to be absent (module not deployed).
- **No duplicate-name assertion.** `prom-client` throws at registration time on a duplicate name, so a collision cannot survive to a running process; asserting it here would re-state a library guarantee.
- **Infrastructure metrics come from generated data, not a `metrics.ts` file.** They are shared across all modules and have no single owning module directory.
