# src/modules/observability/tests/unit/metrics-overview.test.ts

## Purpose

Unit test that verifies `GET /observability/metrics/overview` returns real numeric values for each domain row (auth, business) by incrementing the actual Prometheus counters and reading them back through the shared registry. It exists to catch the silent degradation path where a renamed or unregistered metric name yields zero instead of the true count — a failure no other test in the suite would surface.

## Key elements

- **`counter(name)`** — resolves a metric by name off `metricsRegistry.getSingleMetric`, typed loosely as `{ inc(...) }` via `asStub`. Mirrors exactly how the controller looks up counters.
- **`runOverview()`** — calls `getObservabilityMetricsOverview` with dummy args, then extracts the payload object passed to the mocked `successResponse`.
- **`Overview` interface** — local shape of the expected response body (`auth.loginSuccess`, `auth.loginFailure`, `auth.signupSuccess`, `business.checkoutSuccess`, `business.ordersCreated`).
- **`describe('observability metrics overview')`** — five tests: one per wired counter (auth login, auth signup, cart checkout, orders created) plus one absent-counter test that removes a metric, asserts the row degrades to `0`, then re-registers it.

## Relationships

- **`get-observability-metrics-overview.ts`** — the unit under test; `runOverview` invokes it directly.
- **`metrics-http.ts`** — provides `metricsRegistry`; the test resolves counters by name and uses `removeSingleMetric`/`registerMetric` in the absent-counter case.
- **`response.ts`** — `successResponse` is mocked so the test can capture the controller's output payload.
- **`account/module.ts`, `cart/module.ts`, `orders/module.ts`** — imported purely for the side-effect of registering their counters on the shared registry (routes → controllers → `metrics.ts`). No symbols from these modules are used in assertions.
- **`tests/support/stub.ts`** — provides `asStub` to narrow the registry's `Metric` union to the minimal `Counter`-like shape the test needs.

## Notes

- The registry is **process-global**; the absent-counter test must restore the metric after itself (`metricsRegistry.registerMetric(removed)`) because other suites in the same worker read the same instance.
- The module-manifest imports are a deliberate boundary trick: they register counters without importing any domain controller or service, keeping this spec independent of domain internals. Removing a domain module is only safe here because the counter degrades to absent, not because the import would fail.
- `successResponse` and `rejectResponse` are both replaced with `jest.fn()`; the test only ever reads `successResponse`'s call args.
- `jest.clearAllMocks()` runs in `beforeEach`, so the mocked response's call history is clean per test.
