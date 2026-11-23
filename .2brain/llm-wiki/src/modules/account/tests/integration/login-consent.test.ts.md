---
source: src/modules/account/tests/integration/login-consent.test.ts
source_sha256: b9c8a9f98c2b3900d006d1a4fa2ee0832f0f5152885e069a46dcb703ac1470fd
context_sha256: 2529081be506a30a7156ad0331844d9c284453656c1e960c704c2c381071fa57
generated_at: 2026-11-22T03:56:38.738580+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/tests/integration/login-consent.test.ts

## Purpose
Integration test that checks which consent source gates the `user_logged_in` analytics event on login. The account's stored answer (yes or no) takes precedence. Only for an account that never answered does the `Analytics-Consent` banner header decide. Tests go through the real `POST /account/login` route and spy on the resolved analytics provider's `capture`.

## Key elements
- `setupTestDb()` is called at module level to prepare the test database.
- `beforeEach` sets `NODE_ANALYTICS_PROVIDER=none` and `NODE_ANALYTICS_REQUIRE_CONSENT=true`, resets the provider, and spies on `resolveAnalyticsProvider().capture`.
- `afterEach` restores all mocks and resets the analytics provider.
- `loginWith(stored, header, slug)` is a helper that:
  - creates a user at `<slug>@example.com`, with `analyticsConsent` and `analyticsConsentAt` set only when `stored` is not `undefined`;
  - posts to `/account/login`, adding the `Analytics-Consent` header when one is given;
  - asserts the response status is 200.
- Test cases in `describe('the login analytics event')`:
  - Consent withdrawn (`false`) with banner header `'true'`: `capture` is not called.
  - Consent given (`true`) with no header: `capture` is called with an object containing `event: 'user_logged_in'`.
  - No stored answer: with header `'true'`, `capture` is called once. After `mockClear()`, with no header, `capture` is not called.

## Relationships
- `@infrastructure/observability/analytics` supplies `resolveAnalyticsProvider` (whose `capture` is spied on) and `resetAnalyticsProvider` (used to get a fresh provider per test).
- `@modules/users/tests/factories` supplies `createUser` for seeding accounts and `PLAIN_PASSWORD` for logging in.
- `@tests/setup-test-db` supplies `setupTestDb`.
- `@tests/http` supplies `api()`, the request client used for the login call.
- `@tests/environment` supplies `setEnvironment`, which sets the analytics env vars.

## Notes
- The provider is `none`, so nothing is actually sent. Only the spy on `capture` shows whether an event would have been captured.
- Each `loginWith` call needs a distinct `slug`, since it determines the email and username. The third test calls it twice with different slugs for this reason.
- `capture.mockClear()` is needed in the third test so the second assertion isn't affected by the earlier call.
