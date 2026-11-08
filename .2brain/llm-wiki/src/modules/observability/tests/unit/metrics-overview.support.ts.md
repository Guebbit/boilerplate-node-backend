---
source: src/modules/observability/tests/unit/metrics-overview.support.ts
sha256: 05d3aaa0ae121d6117898c47082f26335345902039072749fdf13587dcd2217f
generated_at: 2026-11-08T06:43:41.293001+00:00
model: ollama:qwen3.8:27b
---

# src/modules/observability/tests/unit/metrics-overview.support.ts

## Purpose
Shared test-support module for the two metrics-overview unit suites. It centralises the small amount of setup both suites need: resolving a metric from the registry by name (so they can assert against its stub) and invoking the controller to capture the payload it sends to `successResponse`.

## Key elements
- **`Overview`** (interface) — the subset of the controller's response payload that the suites assert on (`auth`, optional `business`, `database`).
- **`counter(name)`** — resolves a registered metric by name via `metricsRegistry.getSingleMetric` and wraps it with `asStub` typed for a `.inc` method. Intentionally not narrowed to `Counter`.
- **`histogram(name)`** — same name-based lookup, wrapped as a stub with an `.observe(labels, value)` method.
- **`runOverview()`** — calls `getObservabilityMetricsOverview` with empty `{}` args, then reads the last argument passed to the mocked `successResponse` and returns it typed as `Overview`.

## Relationships
- **`tests/support/stub.ts`** — provides `asStub`, used to wrap registry lookups so consuming tests can inspect call history.
- **`src/infrastructure/observability/metrics-registry.ts`** — `metricsRegistry.getSingleMetric(name)` is the sole way this file obtains a metric instance; the name must match whatever the controller registered.
- **`src/modules/observability/controllers/get-observability-metrics-overview.ts`** — the controller that `runOverview` invokes; its internal calls to `successResponse` and the registry are what the helpers read back.
- **`src/infrastructure/http/response.ts`** — `successResponse` is imported and cast to `jest.Mock` inside `runOverview` to capture the payload argument.
- **`metrics-overview.test.ts` / `metrics-overview-shop.test.ts`** — the two consuming suites that import the helpers from this file.

## Notes
- **`jest.mock` is NOT here.** Because Jest hoists `jest.mock` calls to the top of the *importing* file, each test suite must call `jest.mock('@infrastructure/http/response')` itself. This file only reads the mock's `.mock.calls`.
- `counter` and `histogram` are typed as generic stubs (`inc` / `observe`) rather than the registry's `Metric` union, so they do not assert a metric is a `Counter`/`Histogram`—the lookup itself is what's under test in the suites.
- `runOverview` passes `{}` (cast `as never`) for both controller parameters; the controller under test ignores them in these unit tests.
