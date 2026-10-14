---
source: src/modules/analytics/tests/integration/relay.test.ts
sha256: 7e4509db2d5eb6f5452345e78a7c2c4a9abede0850f1ba7aaef97ce68b29a5e4
generated_at: 2026-10-14T14:56:09.379981+00:00
model: ollama:qwen3.8:27b
---

# src/modules/analytics/tests/integration/relay.test.ts

## Purpose

Integration test for the `POST /analytics/events` relay endpoint. It drives the real HTTP app (with a test database) to verify that the relay enforces visitor consent and strict input validation before forwarding events to the analytics provider, and that it always answers `204` when the event is accepted (consented or not) or `422` when rejected.

## Key elements

- **`capture`** – a `jest.SpyInstance` on `resolveAnalyticsProvider().capture`, re-created in `beforeEach` after resetting the provider. All assertions about "what the provider saw" go through this spy.
- **`beforeEach` / `afterEach`** – set `NODE_ANALYTICS_PROVIDER=none` and `NODE_ANALYTICS_REQUIRE_CONSENT=true`, reset the provider singleton, spy on `capture`; restore mocks and reset provider on teardown.
- **`describe('POST /analytics/events')`** – the single test group, containing:
  - *No-consent case* – expects `204` and zero `capture` calls.
  - *Consented product view* – sends `X-Analytics-Consent: true`, asserts one `capture` call with mapped `properties.product_id`.
  - *Consented search* – asserts mapping of `text`, `page`, `result_count`.
  - *Unknown event name* (`order_created`) – expects `422`, no capture.
  - *Unknown extra field* (`email`) – expects `422`.
  - *`it.each` invalid payloads* – non-hex product id and empty search term, both `422`, no capture.

## Relationships

- **`src/infrastructure/observability/analytics/index.ts`** – imports `resetAnalyticsProvider` and `resolveAnalyticsProvider`; the test calls `resolveAnalyticsProvider()` to obtain the provider instance it spies on, and calls `resetAnalyticsProvider()` to isolate each test.
- **`tests/support/http.ts`** – imports the `api` helper used to issue real HTTP requests against the running app.
- **`tests/support/environment.ts`** – imports `setEnvironment` to inject `NODE_ANALYTICS_PROVIDER` and `NODE_ANALYTICS_REQUIRE_CONSENT` per test.
- **`tests/support/setup-test-db.ts`** – imports `setupTestDb` and calls it once at module load to provision a throwaway database.

## Notes

- The provider is set to `'none'` yet the test still calls `resolveAnalyticsProvider().capture` — the relay's dependency container must resolve a stub implementation for the `'none'` value; the test relies on that.
- Consent is conveyed solely by the `X-Analytics-Consent: true` request header; there is no cookie or query-param path exercised here.
- The relay maps camelCase request fields to snake_case provider properties (`productId → product_id`, `resultCount → result_count`); tests assert the post-mapping shape.
- Both the "consent missing" and "consent present" happy paths return `204`; the only way to distinguish them is the `capture` spy.
- `PRODUCT_ID` is a fixed 24-hex string; the file's comment notes that the backend's id format is exactly 24 hex characters.
