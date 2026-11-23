---
source: src/modules/observability/tests/unit/metrics-overview.support.ts
source_sha256: 23a26b9403a7116f06f0eeaf7b688de678f70027f72e7ee9af6cf0b5193a5ede
context_sha256: cf233affae36bd895debbe034655e15d60d659700cb6a28d275cd6c674fddfe3
generated_at: 2026-11-22T06:05:37.675321+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/observability/tests/unit/metrics-overview.support.ts

## Purpose
Shared helpers for the metrics-overview unit test suites. It provides a way to look up registered metrics by name and a way to run the overview controller and capture the payload it passes to `successResponse`.

## Key elements
- `Overview` (interface): the subset of the controller's payload the tests assert on. It has `auth` (`loginSuccess`, `loginFailure`, `signupSuccess`), an optional `business` (`checkoutSuccess`, `ordersCreated`), and `database` (`queriesTotal`, `errorsTotal`).
- `counter(name)`: resolves a metric from `metricsRegistry` by name, the same way the controller does. It is cast with `asStub` to an object exposing `inc(labelsOrValue?, value?)`.
- `histogram(name)`: the same lookup, cast to an object exposing `observe(labels, value)`.
- `runOverview()`: calls `getObservabilityMetricsOverview` with empty stub arguments. It then reads the last call recorded on the mocked `successResponse` and returns its second argument as an `Overview`.

## Relationships
- `src/modules/observability/controllers/get-observability-metrics-overview.ts`: the controller that `runOverview` invokes.
- `src/infrastructure/http/response.ts`: `runOverview` reads the mocked call history of its `successResponse` export. The file does not mock the module itself.
- `src/infrastructure/observability/metrics-registry.ts`: exports `metricsRegistry`, which `counter` and `histogram` use to look up metrics.
- `tests/support/stub.ts`: supplies `asStub`, which is used for the loose typings and for the dummy controller arguments.
- `metrics-overview.test.ts` and `metrics-overview-shop.test.ts`: the two suites that share these helpers.

## Notes
- Each importing suite must call `jest.mock('@infrastructure/http/response')` itself. `jest.mock` is per test file and hoists there, so this support module cannot do it. Without the mock, `successResponse` is not a mock and `runOverview` will not work.
- `counter` and `histogram` are typed loosely on purpose, to avoid narrowing the registry's `Metric` union to `Counter`.
- `runOverview` takes the most recent `successResponse` call (`calls.at(-1)`), so it returns `undefined` at runtime if the controller never called it.
- `business` is optional because it is absent when no shop module is mounted.
