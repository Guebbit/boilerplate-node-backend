---
source: src/modules/observability/tests/unit/metrics-overview.test.ts
sha256: d4c38e68a316bd09e64bf9be4f7d751112b2ca80f8f1433912da1acc34fea29d
generated_at: 2026-10-15T10:57:54.861921+00:00
model: ollama:qwen3.8:27b
---

# src/modules/observability/tests/unit/metrics-overview.test.ts

## Purpose

Unit tests for the `GET /observability/metrics/overview` endpoint. They verify that each domain row in the response carries real numbers resolved by metric **name** from the shared Prometheus registry, and that a missing counter (e.g. a deleted module) causes the entire block to be omitted rather than reporting zeros.

## Key elements

- **Side-effect imports** (`@modules/account/module`, `@infrastructure/persistence/command-metrics`) — pull in each module's `metrics.ts` so its counters/histograms self-register on the shared registry before any test runs. No internals are imported directly.
- **`jest.mock('@infrastructure/http/response')`** — stubs `successResponse`/`rejectResponse` so the controller under test doesn't perform real HTTP work.
- **`describe('observability metrics overview')`** — four `it` blocks:
  - *login successes/failures* — increments `auth_login_total` via `counter()` and asserts `before`/`after` deltas on `auth.loginSuccess` / `auth.loginFailure`.
  - *signups* — increments `auth_signup_total` and checks `auth.signupSuccess` delta.
  - *database commands/errors* — observes `db_client_operation_duration_seconds` histogram (3 samples, 1 error outcome) and checks `database.queriesTotal` / `database.errorsTotal` deltas.
  - *absent business block* — removes four `cart`/`order`/`inventory` metrics from `metricsRegistry`, asserts the `business` key is **absent** from the response (while `auth` remains), then re-registers them.
- **`metrics-overview.support.ts`** helpers — `counter(name)`, `histogram(name)` fetch a metric by name off the registry; `runOverview()` invokes the controller and returns the parsed body.

## Relationships

- **`src/infrastructure/observability/metrics-registry.ts`** — the single global registry. Tests import `metricsRegistry` directly to call `getSingleMetric` / `removeSingleMetric` / `registerMetric` in the absence test. All other counters are reached through it via the support helpers.
- **`src/modules/account/module.ts`** — imported as a side-effect; its transitive `metrics.ts` registers `auth_login_total` and `auth_signup_total` on the registry. The test never touches account internals.
- **`src/infrastructure/persistence/command-metrics.ts`** — imported as a side-effect; registers `db_client_operation_duration_seconds` histogram.
- **`src/modules/observability/tests/unit/metrics-overview.support.ts`** — provides `counter`, `histogram`, and `runOverview` helpers that this spec uses in every test case.

## Notes

- The registry is **process-global**. The "absent business block" test mutates shared state (removes metrics) and **must** restore them in the same test; a failure before the restore loop will poison later suites that run in the same Jest worker.
- The side-effect imports deliberately mirror the controller's own boundary: it resolves by name, so a renamed or deleted metric degrades to zero/absence rather than a hard import error. The tests encode that contract.
- `business` is optional in `openapi.yaml`; the test asserts its **absence** (not a zero-valued object) when no shop-module counter is registered.
