---
source: src/modules/observability/tests/unit/metrics-overview.test.ts
sha256: d4c38e68a316bd09e64bf9be4f7d751112b2ca80f8f1433912da1acc34fea29d
generated_at: 2026-11-08T06:43:51.099867+00:00
model: ollama:qwen3.8:27b
---

# src/modules/observability/tests/unit/metrics-overview.test.ts

## Purpose

Unit tests for the `GET /observability/metrics/overview` endpoint. Verifies that the controller resolves each domain counter by metric **name** off the shared Prometheus registry (rather than by direct import), so a renamed or deleted module degrades to zero without breaking the response. Also asserts the "absent counter" path where an entire business block is omitted.

## Key elements

- **`describe('observability metrics overview')`** — top-level suite; calls `jest.clearAllMocks()` before each test.
- **`counter('auth_login_total').inc(…)`** — increments the real registry counter before calling `runOverview()` again, asserting delta on `auth.loginSuccess` / `auth.loginFailure`.
- **`counter('auth_signup_total').inc(…)`** — same pattern for `auth.signupSuccess`.
- **`histogram('db_client_operation_duration_seconds').observe(…)`** — feeds the db duration histogram; asserts `database.queriesTotal` and `database.errorsTotal` deltas.
- **Business-block absence test** — removes four metric names from `metricsRegistry` via `removeSingleMetric`, asserts `after.business` is `undefined` while `after.auth` still exists, then re-registers the removed metrics so the process-global registry is restored for later suites.
- **`jest.mock('@infrastructure/http/response', …)`** — stubs `successResponse`/`rejectResponse` so the controller's HTTP layer is a no-op.

## Relationships

- **`src/infrastructure/observability/metrics-registry.ts`** — provides the `metricsRegistry` singleton; the test calls `getSingleMetric`, `removeSingleMetric`, and `registerMetric` on it.
- **`src/infrastructure/persistence/command-metrics.ts`** — side-effect import; registers the `db_client_operation_duration_seconds` histogram on the shared registry.
- **`src/modules/account/module.ts`** — side-effect import; pulls in the account manifest → routes → controllers → metrics, registering `auth_login_total` and `auth_signup_total`.
- **`src/modules/observability/tests/unit/metrics-overview.support.ts`** — supplies the `counter`, `histogram`, and `runOverview` helpers used throughout the tests.

## Notes

- The test file never imports domain controllers or metric definitions directly. It relies on **manifest side-effect imports** (account, command-metrics) to populate the registry, mirroring the boundary the production controller respects.
- The business-block test mutates the **process-global** registry. It must re-register every metric it removes; failure to do so silently breaks any later suite that reads the same registry instance.
- `runOverview()` (from the support file) is the single entry point that triggers the controller's metric-name resolution, so each test follows a capture-before → increment → capture-after → assert-delta pattern.
