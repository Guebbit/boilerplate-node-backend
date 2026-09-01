# src/modules/observability/tests/unit/metrics-overview.test.ts

## Purpose

Unit tests for the `GET /observability/metrics/overview` controller. Verifies that each domain row in the response carries real counter values resolved by metric name from the shared Prometheus registry, and that a missing counter degrades to `0` rather than crashing.

## Key elements

- **`counter(name)`** – Resolves a counter via `metricsRegistry.getSingleMetric(name)` and wraps it in a loose stub exposing only `.inc()`. Typed loosely to avoid asserting the registry's `Metric` union narrowing.
- **`runOverview()`** – Calls `getObservabilityMetricsOverview` with dummy args, then extracts the payload the controller passed to the mocked `successResponse`.
- **`Overview`** – Interface describing the subset of the response shape this suite asserts on (`auth`, `business`, `database` rows).
- **Side-effect imports** (`@modules/account/module`, `@modules/cart/module`, `@modules/orders/module`) – Pull in each module's route/controller/metrics chain so real counters register on the shared registry without the test naming any module's internals.
- **Six test cases** – One per wired metric row (login, signup, checkout, orders, db queries/errors) plus one absent-counter case that removes a metric from the registry, asserts `0`, and restores it.

## Relationships

- **`get-observability-metrics-overview.ts`** – System under test; called inside `runOverview`.
- **`metrics-http.ts`** – Source of `metricsRegistry`; the test reads from and mutates it (inc, remove, re-register) to drive counter state.
- **`response.ts`** – `successResponse` is jest-mocked to capture the controller's output payload.
- **`account/module.ts`, `cart/module.ts`, `orders/module.ts`** – Imported purely for their side effects (registering counters on the shared registry). No direct API calls into them.
- **`tests/support/stub.ts`** – Provides `asStub` for the loosely-typed counter handle.

## Notes

- The "deleted module" test mutates the process-global registry (`removeSingleMetric` / `registerMetric`). It **must** restore the metric, because other suites in the same worker read the same instance.
- Assertions use **delta** (after − before) rather than absolute values, making the suite resilient to test ordering and to other tests incrementing the same counters.
- The controller is called with `{} as never` for both args; the tests rely entirely on the mocked `successResponse` for output capture, so no real HTTP or DI wiring is needed.
- Side-effect module imports are the *only* way counters land on the registry in this spec—intentionally mirroring the controller's name-based lookup boundary so the test stays valid if a module is deleted.
