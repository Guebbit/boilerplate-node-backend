---
source: src/modules/observability/tests/unit/metrics-overview.support.ts
sha256: 6fdd04be4596869530feb69510f3ce02af66ecd49d736e52d5cafd91aa18b3f1
generated_at: 2026-11-14T20:30:59.291616+00:00
model: ollama:qwen3.8:27b
---

# src/modules/observability/tests/unit/metrics-overview.support.ts

## Purpose

Shared helpers for the two metrics-overview unit-test suites. It exposes small functions to look up registered counters/histograms by name and to invoke the controller and capture the payload it passes to `successResponse`, so each test file doesn't repeat that plumbing.

## Key elements

- **`Overview`** (interface) — the subset of the controller's response payload that the suites assert on: `auth` counters, optional `business` counters, and `database` counters.
- **`counter(name)`** — resolves a registered metric by name via `metricsRegistry.getSingleMetric` and wraps the result in an `asStub` exposing only `inc`. Typed loosely (not narrowed to `Counter`) because the registry returns a `Metric` union.
- **`histogram(name)`** — same lookup pattern, wrapped in an `asStub` exposing only `observe`.
- **`runOverview()`** — calls `getObservabilityMetricsOverview` with two stubbed args, then reads the last call's second argument from the `(successResponse as jest.Mock)` mock and returns it as `Overview`.

## Relationships

- **Imports** `asStub` from `tests/support/stub.ts`.
- **Imports** `getObservabilityMetricsOverview` from `src/modules/observability/controllers/get-observability-metrics-overview.ts` (the controller under test).
- **Imports** `successResponse` from `src/infrastructure/http/response.ts` (read from its jest mock at runtime).
- **Imports** `metricsRegistry` from `src/infrastructure/observability/metrics-registry.ts` (used by `counter` and `histogram`).
- **Consumed by** `metrics-overview.test.ts` and `metrics-overview-shop.test.ts`.

## Notes

- `jest.mock` is per test-file and hoists within that file, so **each consuming suite must mock `@infrastructure/http/response` itself**. This module does not mock it; it simply reads the already-installed mock in `runOverview`.
- `runOverview` takes the **last** call of `successResponse` (`calls.at(-1)`), assuming the controller issues exactly one success response per invocation.
- The loose typing of `counter` is intentional: asserting the return type as `Counter` would be circular with the very lookup under test.
