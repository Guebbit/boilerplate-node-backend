---
source: src/modules/account/tests/integration/login-consent.test.ts
sha256: b9c8a9f98c2b3900d006d1a4fa2ee0832f0f5152885e069a46dcb703ac1470fd
generated_at: 2026-10-29T02:56:42.448067+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/login-consent.test.ts

## Purpose

Integration test verifying the consent-gating rules for the `user_logged_in` analytics event during login. It asserts that the account's stored consent answer always wins, and only when no answer has ever been recorded does the `Analytics-Consent` banner header determine whether the event fires. The test drives the real `/account/login` route and inspects the analytics provider's `capture` call.

## Key elements

- **`capture`** (module-level `jest.SpyInstance`) — spy on `resolveAnalyticsProvider().capture`, set up in `beforeEach` after resetting the provider and pointing `NODE_ANALYTICS_PROVIDER` at `'none'`.
- **`loginWith(stored, header, slug)`** — helper that (1) creates a user via the `createUser` factory with an optional `analyticsConsent` value, (2) POSTs to `/account/login` through the `api()` HTTP helper, (3) optionally sets the `Analytics-Consent` header, and (4) asserts a 200 response.
- **Three `it` blocks** — cover: stored "no" overrides a banner "yes"; stored "yes" sends the event without any header; no stored answer defers to the banner header (both "true" and absent cases, using `capture.mockClear()` between the two sub-scenarios).

## Relationships

- **`@infrastructure/observability/analytics`** — imports `resetAnalyticsProvider` and `resolveAnalyticsProvider`; the test spies on the resolved provider's `capture` method to assert event emission.
- **`@modules/users/tests/factories`** — imports `createUser` (to seed accounts with a specific consent state) and `PLAIN_PASSWORD` (the known password for login).
- **`@tests/environment`** — imports `setEnvironment` to set `NODE_ANALYTICS_PROVIDER` and `NODE_ANALYTICS_REQUIRE_CONSENT` before each test.
- **`@tests/http`** — imports `api` to construct and send the real HTTP login request.
- **`@tests/setup-test-db`** — imports `setupTestDb` to provision a fresh in-memory database before the suite runs.

## Notes

- The suite sets `NODE_ANALYTICS_PROVIDER` to `'none'` so no real analytics sink is contacted; all assertions go through the `capture` spy.
- `NODE_ANALYTICS_REQUIRE_CONSENT` is explicitly `'true'` — without it the consent-gating branch under test would be inactive.
- The third test (`banner-yes` / `banner-none`) reuses `loginWith` twice within a single `it`, calling `capture.mockClear()` in between. This couples two assertions into one test case rather than splitting them.
- `void request.set(...)` suppresses the unused-promise lint warning; `set` is fire-and-forget on the HTTP helper's request builder.
