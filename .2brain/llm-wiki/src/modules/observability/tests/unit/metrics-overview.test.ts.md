---
source: src/modules/observability/tests/unit/metrics-overview.test.ts
sha256: c50f74b19f9a4b1c35e64b2c14bf8a83f9c624b2a2e1579c37f6c7402f42ac5f
generated_at: 2026-09-23T18:58:34.465522+00:00
model: ollama:qwen3.8:27b
---

# src/modules/observability/tests/unit/metrics-overview.test.ts

## Purpose

Unit test for the `GET /observability/metrics/overview` endpoint. It verifies that each domain row in the response payload carries the actual counter value resolved by metric **name** from the shared Prometheus registry, and that a missing counter (e.g. after a module is deleted) degrades to `0` without breaking the fixed response shape.

## Key elements

- **`Overview`** — local interface describing the payload subset the suite asserts on (`auth`, `business`, `database` sections).
- **`counter(name)`** — helper that resolves a metric by name via `metricsRegistry.getSingleMetric` and casts it to a minimal `{ inc }` stub, avoiding a hard type dependency on the registry's `Metric` union.
- **`runOverview()`** — calls `getObservabilityMetricsOverview` with empty args and returns the payload passed to the (mocked) `successResponse`.
- **Test cases** — one per wired row (login success/failure, signup, checkout, orders created, db queries/errors) plus one for the absent-counter path. Each increments the real counter, re-runs the controller, and asserts the delta.

## Relationships

- **`get-observability-metrics-overview.ts`** — the controller under test; called directly with `{} as never` args.
- **`metrics-registry.ts`** — the shared registry the controller reads from and the tests increment via `counter()`; the absent-counter test also calls `removeSingleMetric` / `registerMetric` on it.
- **`response.ts`** — mocked wholesale so `successResponse` becomes a `jest.fn()` whose call args yield the payload.
- **`account/module.ts`, `cart/module.ts`, `orders/module.ts`** — imported for their **side effect only** (loading manifests → routes → controllers → `metrics.ts`), which registers the real counters on the shared registry. Their internals are never referenced.
- **`tests/support/stub.ts`** — provides `asStub` used by the `counter` helper to cast the registry lookup result.

## Notes

- The three module imports at the top are **side-effect imports**; they exist solely to populate the global registry. Removing any of them silently drops its counters and the corresponding assertions will see zeros.
- The absent-counter test **mutates the process-global registry** (removes then re-registers `cart_checkout_total`). If the metric was `undefined` it skips the restore. Later suites in the same Jest worker share this registry instance.
- `successResponse` and `rejectResponse` are both mocked, but only `successResponse` is asserted on. If the controller ever branches to `rejectResponse`, `runOverview` will return `undefined` and assertions will fail with an opaque error.
- The controller is invoked with `{} as never` for both args — no real `req`/`res` objects are needed because the response shape is fully determined by the registry state.
