---
source: src/modules/observability/tests/unit/metrics-overview.support.ts
sha256: 05d3aaa0ae121d6117898c47082f26335345902039072749fdf13587dcd2217f
generated_at: 2026-10-15T10:57:43.830003+00:00
model: ollama:qwen3.8:27b
---

# src/modules/observability/tests/unit/metrics-overview.support.ts

## Purpose

Shared helpers for the metrics-overview unit-test suites. It provides a small, typed surface for (1) looking up a registered counter or histogram by name, (2) invoking the overview controller, and (3) extracting the payload the controller passes to `successResponse`. Centralising these lets both `metrics-overview.test.ts` and `metrics-overview-shop.test.ts` avoid duplicating the same boilerplate.

## Key elements

- **`Overview`** (interface) — the subset of the controller's response payload the suites assert on: `auth`, optional `business`, and `database` blocks, each with numeric fields.
- **`counter(name)`** — resolves a metric by name via `metricsRegistry.getSingleMetric` and wraps the result with `asStub`, exposing an `inc` method for call-assertion. Intentionally typed as the registry's `Metric` union rather than narrowed to `Counter`.
- **`histogram(name)`** — same lookup pattern as `counter`, but the stub surface is `{ observe: (labels, value) => void }`.
- **`runOverview()`** — calls `getObservabilityMetricsOverview` with placeholder args, then reads the **last** call's second argument from `successResponse`'s Jest mock and casts it to `Overview`.

## Relationships

- **`src/infrastructure/observability/metrics-registry.ts`** — `counter` and `histogram` call `metricsRegistry.getSingleMetric(name)` to retrieve the live metric objects that the tests then assert on.
- **`src/modules/observability/controllers/get-observability-metrics-overview.ts`** — `runOverview` invokes the controller under test.
- **`src/infrastructure/http/response.ts`** — `runOverview` reads `successResponse` as a `jest.Mock` to capture the payload. The **importing test file** is responsible for calling `jest.mock('@infrastructure/http/response')`; the mock does not live in this support module.
- **`tests/support/stub.ts`** — provides `asStub`, used to wrap registry lookups so tests can spy on `inc` / `observe`.
- **`metrics-overview.test.ts` / `metrics-overview-shop.test.ts`** — the two consumer suites that import these helpers.

## Notes

- **`jest.mock` is per-test-file and hoisted there.** This module does *not* mock `@infrastructure/http/response`; each importing test file must declare its own `jest.mock` call for `successResponse` to be available as a mock inside `runOverview`.
- `runOverview` passes `{}` (cast `as never`) for the controller's `req`/`res` parameters — the controller under test must not dereference them in the happy path, or these calls will throw.
- `counter`/`histogram` are deliberately **not** typed as `Counter`/`Histogram`; the lookup returns the registry's `Metric` union and narrowing it would defeat the point of the test (asserting the lookup itself).
- `runOverview` returns only the **last** `successResponse` call. If a test triggers the controller multiple times, earlier payloads are lost.
