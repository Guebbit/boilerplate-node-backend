---
source: src/modules/analytics/tests/integration/relay.test.ts
sha256: 034b4fde357d0a65b822efabf47542eb092f584cf52dfb10fae106f48f9a2218
generated_at: 2026-11-08T04:59:42.673754+00:00
model: ollama:qwen3.8:27b
---

# src/modules/analytics/tests/integration/relay.test.ts

## Purpose

Integration test for the `POST /analytics/events` relay endpoint. Verifies the relay's core contract: the response is always `204` for well-formed events (consented or not), but the analytics provider's `capture` is only invoked when the visitor has consented. Also exercises the validation gate (closed event set, no extra fields, field-format checks) which returns `422` regardless of consent.

## Key elements

- **`beforeEach`** — Pins the environment to `NODE_ANALYTICS_PROVIDER: 'none'` and `NODE_ANALYTICS_REQUIRE_CONSENT: 'true'`, resets the provider singleton, and installs a jest spy on the resolved provider's `capture` method (stored in module-level `capture`).
- **`afterEach`** — Restores all mocks and resets the provider singleton.
- **`PRODUCT_ID` / `VIEW`** — Constants for a valid 24-hex-char product id and a minimal `product_viewed` payload.
- **Test cases** (seven):
  - 204 + no capture without consent.
  - 204 + one capture with consent; asserts `product_id` is mapped into `properties`.
  - 204 + capture for `products_searched`; asserts `text`, `page`, `result_count` mapping.
  - 422 for an event name outside the closed set.
  - 422 for an unknown extra field (`email`).
  - 422 (parameterised) for a malformed product id and an empty search term.

## Relationships

- **`src/infrastructure/observability/analytics/index.ts`** — Provides `resetAnalyticsProvider` and `resolveAnalyticsProvider`; the test spies on the `capture` method of the resolved provider instance.
- **`tests/support/environment.ts`** — `setEnvironment` is used to pin env vars before each case.
- **`tests/support/http.ts`** — `api()` returns a supertest-style client bound to the real app; all requests go through it.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` is called at module level to prepare the test database before any test runs.

## Notes

- The test drives the **real app** (not a unit-level mock of the route handler). The only seam is the spy on the provider's `capture`.
- Consent is signalled via the `Analytics-Consent: true` header, not a cookie or body field.
- The `NODE_ANALYTICS_PROVIDER: 'none'` setting means no real external call ever occurs; the spy proves the relay *would* have called `capture` without the consent guard.
- Event names are a **closed set**; adding a new event name requires updating both the backend allow-list and these tests.
- Field-name mapping is tested implicitly (e.g. `resultCount` → `result_count`); the test asserts the provider-facing shape, not the wire shape.
