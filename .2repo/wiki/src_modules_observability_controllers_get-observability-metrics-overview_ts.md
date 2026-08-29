# src/modules/observability/controllers/get-observability-metrics-overview.ts

## Purpose

Implements the `GET /observability/metrics/overview` endpoint, returning a structured JSON snapshot of HTTP, auth, business, database (placeholder), and process metrics in a single response. It exists as the dashboard's single read surface for operational health across all modules.

## Key elements

- **`getObservabilityMetricsOverview`** (exported) — The Express handler. Fires all metric reads in parallel via `Promise.all`, assembles the fixed response shape, and sends it with `successResponse`.
- **`readCounter`** (internal) — Looks up a metric by *name* on `metricsRegistry` and returns its samples. Absent metrics (module not in this build) resolve to `[]`, yielding zero in the payload. This avoids importing domain-specific counters, keeping the observability module free of `dependsOn` edges into any business domain.
- **`sumByLabel`** (internal) — Sums a counter's sample values filtered by a label key/value pair (e.g. `status: 'success'`).
- **`MetricSample`** (interface) — Describes a single prom-client counter/gauge sample: `value` + `labels`.

## Relationships

- **`src/infrastructure/http/response.ts`** — Provides `successResponse`, used to serialize the final payload.
- **`src/infrastructure/http/controller.ts`** — Provides `catchAs`, the error wrapper attached to the handler's `.catch`.
- **`src/infrastructure/observability/metrics-http.ts`** — Source of `metricsRegistry`, `getHttpRequestCounters`, `httpInflightRequests`, and `getLatencyPercentiles`. The registry lookup inside `readCounter` is how domain counters are discovered by name.
- **`src/infrastructure/observability/process-snapshot.ts`** — Provides `processSnapshot()` for uptime and memory fields.
- **`src/modules/observability/routes.ts`** — Registers this handler on the `/observability/metrics/overview` route.
- **`src/modules/observability/tests/unit/metrics-overview.test.ts`** — Unit tests exercising the handler's assembly logic and the absent-metric (zero) path.

## Notes

- **Decoupling by name lookup:** `readCounter` deliberately avoids importing counters from `account`, `cart`, `orders`, `inventory`, etc. Deleting any of those modules must not produce a compile error here. The trade-off is a stringly-typed metric name; a typo silently returns zero rather than failing at build time.
- **Database block is hardcoded:** `queriesTotal` and `errorsTotal` are literal `0`s, not read from the registry. The `openapi.yaml` contract requires the block, but no DB instrumentation exists yet. When the driver is instrumented, these two lines become `readCounter` calls.
- **Response shape is contract-locked:** The payload structure is defined in `openapi.yaml` and must remain stable regardless of which modules are present in a given build. Missing metrics always surface as zero, never as `null` or a missing key.
- **Inflight gauge:** `httpInflightRequests` is a gauge read via `.get()` and summed across all label values, unlike the counter metrics which go through `readCounter`.
