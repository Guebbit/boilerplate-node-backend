# src/modules/observability/controllers/get-observability-metrics-overview.ts

## Purpose

Handler for `GET /observability/metrics/overview`. Aggregates HTTP, auth, business, database, and process metrics into a single structured JSON response. It resolves domain counters by metric **name** against the shared prom-client registry instead of importing them directly, so the observability module never compiles against the domains it reports on.

## Key elements

- **`MetricSample`** – local interface for one prom-client counter sample (`value`, `labels`).
- **`readCounter(name)`** – looks up a metric by name on `metricsRegistry`; returns `[]` if the metric is absent (i.e., the owning module isn't in this build). This is the indirection that keeps the controller decoupled from domain modules.
- **`sumByLabel(values, labelKey, labelValue)`** – filters samples to a label value and sums their values (used for success/failure breakdowns).
- **`getObservabilityMetricsOverview`** (exported) – the Express handler. Fires all metric reads in parallel via `Promise.all`, assembles the fixed-shape payload, and sends it through `successResponse`. Errors are forwarded to `catchAs`.

## Relationships

- **`@infrastructure/http/controller`** – provides `catchAs`, which formats the error response in the `.catch` branch.
- **`@infrastructure/http/response`** – provides `successResponse`, which serialises the payload into the Express response.
- **`@infrastructure/observability/metrics-http`** – source of `metricsRegistry`, `getHttpRequestCounters`, `httpInflightRequests`, and `getLatencyPercentiles`. All HTTP-level metrics and the registry lookup go through this module.
- **`@infrastructure/observability/process-snapshot`** – provides `processSnapshot()`, called once per request to capture uptime and memory into the `process` section.
- **`src/modules/observability/routes.ts`** – registers the `GET /observability/metrics/overview` route that dispatches to this handler.
- **`src/modules/observability/tests/unit/metrics-overview.test.ts`** – unit tests exercising the handler's aggregation logic and error path.

## Notes

- **No domain imports by design.** The `.dependency-cruiser.cjs` rule `module-coupling-observability` enforces that this module may only reach `audit-logs` among domains. Adding a direct counter import (e.g. from `account` or `orders`) would break that rule and create a compile-time dependency that defeats the purpose.
- **Absent metric ≠ error.** If a domain module is excluded from a build, its counters simply don't exist on the registry. `readCounter` returns `[]`, the row reports zero, and the response shape stays identical—clients never need to know which modules are present.
- **Gauges are read via the same path.** `products_low_stock_total` and `inventory_reserved_units_total` are gauges, but because prom-client re-collects on `.get()`, the name-based read works identically to counters.
- **Response contract is fixed by `openapi.yaml`.** The field set and types are stable regardless of which domain modules are deployed.
