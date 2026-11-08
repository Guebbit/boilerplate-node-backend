---
source: tests/cross-cutting/metric-names.test.ts
sha256: 17531db29ba95d42bf0321b58884176344a733550d93c8d5375551f5c6479b29
generated_at: 2026-11-08T09:28:02.609699+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/metric-names.test.ts

## Purpose

Cross-cutting test that verifies every metric name the observability overview controller reads by string literal actually corresponds to a metric declared and registered by a module. It works by parsing **source text** (regex over `.ts` files) rather than importing the modules, so it never boots Mongoose or opens a database. The problem it guards: renaming a counter compiles and passes all unit tests, but the overview endpoint silently reports the metric as absent.

## Key elements

- **`withoutComments(source)`** — Strips block and line comments from source text before regex matching. Exists because `account/metrics.ts` has a convention note that sits exactly where the declaration regex expects the first field.
- **`metricFiles()`** — Discovers every `src/modules/<name>/metrics.ts` on disk; returns module name + path pairs.
- **`declarations()`** — Flattens all metric names extracted from module `metrics.ts` files (via `new Counter|Gauge|Histogram|Summary({ name: '…' })`) plus names from the generated `infrastructureMetricData` export.
- **`namesReadByLiteral()`** — Extracts metric names the overview controller passes to `readCounter('…')`.
- **`shopMetricNames()`** — Reads the `SHOP_METRIC_NAMES` array literal from the controller source; these names are optional *as a group* (all-or-nothing).
- **`describe('metric names')`** — Three `it` blocks:
  1. **Canary** — Asserts minimum counts so the other tests can't pass vacuously over empty lists.
  2. **Name resolution** — Every `readCounter` literal must match a declared name, with the shop-metric group treated as an atomic optional set.
  3. **Shared-registry registration** — The number of `new Counter|Gauge|…(` occurrences must equal the number of `registers: [metricsRegistry]` occurrences per file, ensuring no metric is registered on a private registry.

## Relationships

- **`tests/support/paths.ts`** — Imports `MODULES_ROOT` to construct absolute paths to module directories and the overview controller file.
- **`@infrastructure/observability/metrics.generated`** — Imports `infrastructureMetricData` to include infrastructure-level metric names in the declaration set (these are data-driven via `shared/rules/metrics.yaml`, not declared in a single module's `metrics.ts`).

## Notes

- All extraction is regex-over-source-text; it is intentionally *not* a type-level or runtime check. A refactor that renames the `readCounter` call shape, the `registers:` array syntax, or the `SHOP_METRIC_NAMES` constant will silently break the extraction (caught only by the canary).
- The `withoutComments` helper is load-bearing: without it, `account/metrics.ts` causes the regex to skip the `low_stock_total` counter entirely.
- Infrastructure metrics are attributed to a synthetic `"infrastructure"` module so they appear in the declared-name set even though no single module "owns" them.
- The test does **not** assert snake_case style, `_total` suffix, or `help` string quality — those are reviewer concerns, not invariants the code enforces.
- Duplicate-name collisions are **not** checked here; `prom-client` throws at runtime on registration, so a duplicate can never reach a running process.
