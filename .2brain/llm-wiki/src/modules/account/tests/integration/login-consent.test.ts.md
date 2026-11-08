---
source: src/modules/account/tests/integration/login-consent.test.ts
sha256: b9c8a9f98c2b3900d006d1a4fa2ee0832f0f5152885e069a46dcb703ac1470fd
generated_at: 2026-11-08T04:37:51.668822+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/login-consent.test.ts

## Purpose

Integration test that verifies the consent-gating logic for the `user_logged_in` analytics event at login: the account's stored consent answer (yes or no) is authoritative, and the `Analytics-Consent` banner header is consulted only when the account has never answered. Exercises the real `/account/login` route with the analytics provider's `capture` spied on.

## Key elements

- **`loginWith(stored, header, slug)`** — helper that creates a user (with optional `analyticsConsent` + `analyticsConsentAt`) via the factory, then POSTs to `/account/login` with an optional `Analytics-Consent` header; asserts a 200 response.
- **`capture`** (module-level `jest.SpyInstance`) — spy on `resolveAnalyticsProvider().capture`, re-installed in `beforeEach` after resetting the provider.
- **Three test cases** covering the consent matrix:
  - Stored `false` + header `'true'` → no event.
  - Stored `true` + no header → event sent.
  - Stored `undefined` + header `'true'` → event sent; stored `undefined` + no header → no event.

## Relationships

- **`tests/support/setup-test-db.ts`** — `setupTestDb()` is called at module load to provision an isolated test database.
- **`tests/support/http.ts`** — `api()` provides the HTTP client used to hit the real login endpoint.
- **`tests/support/environment.ts`** — `setEnvironment()` configures `NODE_ANALYTICS_PROVIDER` and `NODE_ANALYTICS_REQUIRE_CONSENT` before each test.
- **`src/infrastructure/observability/analytics/index.ts`** — `resetAnalyticsProvider()` and `resolveAnalyticsProvider()` are imported to configure the "none" provider and attach the `capture` spy.
- **`src/modules/users/tests/factories.ts`** — `createUser` and `PLAIN_PASSWORD` are used to seed a valid account for the login request.

## Notes

- The provider is set to `'none'` but the spy is placed on `resolveAnalyticsProvider().capture`; this is the mechanism by which the test asserts whether the event *would* have been emitted without actually shipping telemetry.
- Consent priority is the core contract under test: **stored answer beats banner header**. The banner is only a fallback for accounts where `analyticsConsent` is `undefined`.
- `setupTestDb()` runs once at module scope (outside `beforeEach`), so the same database instance is reused across all three cases.
