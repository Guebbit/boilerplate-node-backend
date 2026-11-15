---
source: tests/cross-cutting/metric-names.test.ts
sha256: b5b32ea4107e6adbd688d6d730ccd5a01fcd4ab4d703cf22d359d8eea83c22ef
generated_at: 2026-11-14T23:04:33.650854+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/metric-names.test.ts

## Purpose

Cross-cutting test that verifies metric-name consistency across three sites that agree by convention rather than by type: module metric declarations, the `get-observability-metrics-overview` controller (which reads names as string literals), and generated infrastructure metrics. It exists because a counter rename compiles, lints, and passes every unit test, yet silently breaks the overview endpoint and external dashboards. All assertions are made by reading **source text** (never by importing the modules) so the test cannot boot Mongoose or trigger side effects.

## Key elements

- **`withoutComments(source)`** — strips block and line comments so a comment between `new Counter({` and `name:` (present in `account/metrics.ts`) cannot hide a declaration from the regex sweep.
- **`metricFiles()`** — discovers every per-module metric declaration file on disk under `MODULES_ROOT`; no hard-coded list.
- **`declarations()`** — returns `{ module, name }` for every metric found via `new (Counter|Gauge|Histogram|Summary)({ name: '…'` in those files, plus all names from `infrastructureMetricData` (generated from `shared/rules/metrics.yaml`).
- **`namesReadByLiteral()`** — extracts every string passed to `readCounter('…')` in the overview controller source.
- **`shopMetricNames()`** — extracts the `SHOP_METRIC_NAMES` array literal from the same controller.
- **Test: "finds the metrics and the readers…"** — canary assertions that each discovery function returned a non-trivial count; prevents silent empty-list passes if a file moves or a call shape changes.
- **Test: "resolves every name the overview endpoint reads by string"** — every name from `readCounter` must appear in `declarations()`, with a carve-out: if *no* shop metric is declared the whole group is considered undeployed and skipped.
- **Test: "registers every metric on the shared registry"** — per module, the count of `new …(` declarations must equal the count of `registers: [metricsRegistry]` entries, catching a counter registered on a private registry (invisible to `/metrics`).

## Relationships

- **`tests/support/paths.ts`** — imported as `@tests/paths`; supplies `MODULES_ROOT`, the base directory from which the test discovers per-module metric declaration files.
- **`tests/unit/scripts/mutation/ci/waves.test.ts`** — graph-adjacent (both are cross-cutting convention tests) but has no direct import or runtime interaction with this file.

## Notes

- The test deliberately **does not** assert one-owner-per-name: `prom-client` already throws on duplicate registration, so that invariant is guaranteed by the library.
- Shop metrics are treated as an **all-or-nothing group** at the endpoint level; the test mirrors that semantics rather than requiring each individually.
- Infrastructure metrics are attached to a synthetic `module: 'infrastructure'` owner because they are data-driven (YAML → generated TS) and shared across all modules; no single declaration file owns them.
- The canary test is load-bearing: without it, a typo in a regex or a renamed controller file would make every subsequent test pass over an empty list and prove nothing.
