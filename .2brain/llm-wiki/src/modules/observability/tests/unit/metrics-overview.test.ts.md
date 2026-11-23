---
source: src/modules/observability/tests/unit/metrics-overview.test.ts
source_sha256: 4b54c935bd998eba18e4f6b82964bae12e69f43982b3cc6bfc7e70cae9ac3560
context_sha256: f09074b41985d5cfec2b25752790ae7d0f62f8af20b1508562dd56ef283c6a8a
generated_at: 2026-11-22T06:05:51.439216+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/observability/tests/unit/metrics-overview.test.ts

## Purpose
Unit tests for `GET /observability/metrics/overview`, checking that the domain rows (auth, database, optional business) carry real numbers. The controller looks up each counter by metric name on the shared prom registry. A renamed metric or an unregistered module would therefore degrade to zero without any error. These tests increment the real counters and assert the overview moves, and they also cover the absent-counter case.

## Key elements
- **Manifest imports** (`@modules/account/module`, `@infrastructure/persistence/command-metrics`): imported for side effects only. Loading them registers the real counters on the shared registry, so the spec never names another module's internals.
- **`jest.mock('@infrastructure/http/response', ...)`**: replaces `successResponse` and `rejectResponse` with `jest.fn()`. `beforeEach` calls `jest.clearAllMocks()`.
- **Login test**: increments `auth_login_total` with `status: success` (+2) and `status: failure` (+3). It asserts `auth.loginSuccess` and `auth.loginFailure` rise by those amounts.
- **Signup test**: increments `auth_signup_total` (success, +1) and asserts `auth.signupSuccess` rises by 1.
- **Database test**: observes three samples on the `db_client_operation_duration_seconds` histogram (two `success`, one `error`). It asserts `database.queriesTotal` rises by 3 and `database.errorsTotal` by 1.
- **Business-block test**: removes the `cart_checkout_total`, `order_created_total`, `products_low_stock_total` and `inventory_reserved_units_total` metrics from the registry. It asserts the result has no `business` key while `auth` is still defined, then re-registers them.

## Relationships
- `src/modules/observability/tests/unit/metrics-overview.support.ts`: supplies `counter`, `histogram` and `runOverview`. The tests use them to fetch metrics by name and to invoke the overview and read its result.
- `src/infrastructure/observability/metrics-registry.ts`: provides `metricsRegistry`, used directly in the business-block test (`getSingleMetric`, `removeSingleMetric`, `registerMetric`).
- `src/modules/account/module.ts`: imported so the account counters (`auth_login_total`, `auth_signup_total`) get registered.
- `src/infrastructure/persistence/command-metrics.ts`: imported so the DB command histogram gets registered.

## Notes
- Each test measures a before/after delta instead of asserting absolute values, because the registry is process-global and counters persist across tests.
- The business-block test mutates the global registry. It restores the removed metrics at the end of the test, not in an `afterEach`, so a failing assertion before the restore would leave them removed for later suites.
- The business-block test removes only four metric names. This matches the "foundation-only build" case, where `business` is optional in `openapi.yaml`.
