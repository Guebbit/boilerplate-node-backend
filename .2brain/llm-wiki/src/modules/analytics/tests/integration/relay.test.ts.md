---
source: src/modules/analytics/tests/integration/relay.test.ts
source_sha256: 034b4fde357d0a65b822efabf47542eb092f584cf52dfb10fae106f48f9a2218
context_sha256: 31b583b8cabe6c390594d8be4516d5e20e724652e2faf5ec6e87bbde4b5b5d54
generated_at: 2026-11-22T04:18:44.603293+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/analytics/tests/integration/relay.test.ts

## Purpose
Integration test for the `POST /analytics/events` relay endpoint. It checks the relay's core guarantee: nothing is forwarded to the analytics provider before the visitor consents, and the response is `204` either way. Tests go through the real app, with the resolved provider's `capture` method spied on.

## Key elements
- **`setupTestDb()`**: registers the test database lifecycle for the suite.
- **`beforeEach` / `afterEach`**: set `NODE_ANALYTICS_PROVIDER=none` and `NODE_ANALYTICS_REQUIRE_CONSENT=true`, reset the provider, and spy on `resolveAnalyticsProvider().capture`. Afterwards they restore mocks and reset the provider again.
- **`capture`**: the `jest.SpyInstance` that every test asserts against.
- **`PRODUCT_ID` / `VIEW`**: a valid 24-hex-character product id and a `product_viewed` payload, reused across tests.
- **Test cases** in `describe('POST /analytics/events')`:
  - Without consent: returns `204` and `capture` is not called.
  - With the `Analytics-Consent: true` header, a `product_viewed` event is captured once with `properties: { product_id }`.
  - A `products_searched` event is captured with `text`, `page` and `result_count` (mapped from `resultCount`).
  - An event name outside the allowed set (`order_created`) returns `422` with no capture, even with consent.
  - An unknown extra field (`email`) returns `422`.
  - An `it.each` table covers a malformed product id and an empty search term. Both return `422` and nothing is captured.

## Relationships
- `@infrastructure/observability/analytics` (`src/infrastructure/observability/analytics/index.ts`): supplies `resolveAnalyticsProvider` (whose `capture` is spied on) and `resetAnalyticsProvider` (clears the cached provider between tests).
- `tests/support/environment.ts`: `setEnvironment` sets the analytics env vars.
- `tests/support/http.ts`: `api()` provides the HTTP client for the requests.
- `tests/support/setup-test-db.ts`: `setupTestDb` prepares the test database.

## Notes
- The provider is set to `'none'` and then spied on, so the tests observe whether `capture` is called without any real provider receiving events.
- Consent is signalled per request by the `Analytics-Consent: true` header.
- Validation failures return `422` and happen regardless of consent.
