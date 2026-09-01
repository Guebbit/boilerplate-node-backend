# tests/cross-cutting/metric-names.test.ts

## Purpose

Cross-cutting test that guarantees metric name consistency between three places that must agree: module `metrics.ts` declarations, the observability overview controller (which reads names as raw strings to avoid importing domain modules), and external Prometheus/Grafana dashboards. It works by parsing **source text** rather than importing modules, because importing would boot Mongoose and execute aggregation queries. Its job is to catch the silent failure mode where a renamed counter still compiles, lints, and passes unit tests but quietly disappears from the overview endpoint and goes flat on dashboards.

## Key elements

- **`withoutComments(source)`** — strips block and line comments so the regex sweep doesn't skip or misread declarations hiding behind inline notes.
- **`INFRASTRUCTURE_METRIC_FILES`** — hardcoded list of non-domain metric files (e.g. `src/infrastructure/persistence/metrics.ts`) whose counters are shared across all repositories.
- **`metricFiles()`** — discovers every `src/modules/<name>/metrics.ts` on disk, appends the infrastructure files, returns `{ module, file }` pairs.
- **`declarations()`** — regex-extracts every `new (Counter|Gauge|Histogram|Summary)({ name: '…', help: '…' })` block from all metric files; returns `{ module, name, kind, help }`.
- **`nameAssignments()`** — finds every line containing `name:` in a metric file (literal or computed), used to enforce the "must be a string literal" rule.
- **`namesReadByLiteral()`** — extracts every `readCounter('…')` argument from `get-observability-metrics-overview.ts`.
- **Test cases (7):**
  - *Canary / existence* — asserts at least 5 files, 12 declarations, 5 literal reads, so a silent file rename doesn't make every assertion pass over an empty list.
  - *Name resolution* — every string the controller reads must match a declared name.
  - *Literal enforcement* — every `name:` must be a quoted string, not a variable or template.
  - *Shared-registry registration* — the count of `new <Kind>(` calls must equal the count of `registers: [metricsRegistry]` in each file.
  - *Naming convention* — names must be lowercase `snake_case` per the Prometheus exposition format.
  - *Counter suffix* — `Counter` instances must end in `_total` (OpenMetrics monotonic-series marker).
  - *Help text* — every metric's `help` must be ≥ 15 characters so a 3 am pager can interpret it.

## Relationships

No graph neighbors. The test imports only `node:fs` and `node:path`; it has no runtime dependency on the files it reads. The files it **reads as text** (every `src/modules/*/metrics.ts`, `src/infrastructure/persistence/metrics.ts`, and `src/modules/observability/controllers/get-observability-metrics-overview.ts`) are its subjects but not its imports.

## Notes

- The test intentionally does **not** assert uniqueness of metric names — `prom-client` itself throws on duplicate registration, so a collision cannot survive to a running process.
- Reading source text is only sound under two invariants the test enforces: every name is a **literal** (not computed) and every metric registers on the **shared** registry. If either invariant is violated, the sweep becomes unsound.
- The `withoutComments` helper exists because `account/metrics.ts` has a comment line sitting exactly where the regex expects the first field of a counter block; without stripping it, the sweep misses that counter.
- Infrastructure metrics (`db_queries_total`, `db_errors_total`) are not owned by any single domain module but are still read by name in the overview controller, so they are included in the sweep via `INFRASTRUCTURE_METRIC_FILES`.
