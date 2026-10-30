---
source: tests/support/rate-limit-harness.ts
sha256: 311127b1211e82c605630889facc59b3d9db6e1973c27b367924a33f1a205af8
generated_at: 2026-10-29T07:10:02.531195+00:00
model: ollama:qwen3.8:27b
---

# tests/support/rate-limit-harness.ts

## Purpose

A minimal test harness for driving `express-rate-limit` middleware in isolation over real HTTP (via supertest). It fills the gap between `tests/support/express.ts` (a stub where no real middleware runs) and `tests/support/http.ts` (a fully mounted app carrying routing, auth, and serialization that are irrelevant to a rate-limiter's behaviour). It exists so integration tests can assert limiter budgets, key strategies, and trust-proxy handling without the noise of the full application.

## Key elements

- **`withReloadedRateLimits(modulePath, overrides, pick)`** — Forces a fresh `import()` of a rate-limit module with specific environment variables set (via `jest.resetModules()` + `withEnvironmentOverrides`). Returns whatever `pick` extracts from the reloaded module. Required because `express-rate-limit` bakes its options in at construction time; the global test setup has already raised budgets for unrelated suites.
- **`appAnswering(status, trustProxyHop, ...limiters)`** — Builds a throwaway Express app with `express.json()` and `cookieParser()` middleware, then mounts the supplied limiter chain on `POST /route`, which always responds with the given HTTP status. `trustProxyHop` sets `app.set('trust proxy', 1)` to make `X-Forwarded-For` populate `request.ip`, matching production `NODE_TRUST_PROXY_HOPS` behaviour.
- **`statusOf(pending)`** — Awaits a pending supertest request and returns only its numeric status code, so callers don't need to destructure the full response.

## Relationships

- **`tests/support/environment.ts`** — `withReloadedRateLimits` delegates to `withEnvironmentOverrides` for safe, exception-proof environment variable scoping around the re-import.
- **Integration test consumers** (e.g. `identity-rate-limit.test.ts`, `checkout-rate-limit.test.ts`, `payment-velocity.test.ts`, `submission-rate-limit.test.ts`, `device-cookie-budget.test.ts`, `auth-hardening.test.ts`, `auth-races.test.ts`, `global-limit-refund.test.ts`, `merge-rate-limit.test.ts`, `contact-identity-rate-limit.test.ts`, `refusal-request-id.test.ts`) — Import `appAnswering` and/or `withReloadedRateLimits` to build a clean app around the limiter under test and to obtain limiter instances configured for the scenario.
- **`tests/unit/infrastructure/http/middlewares/rate-limit-store.test.ts`** — Unit-level test for the rate-limit store; conceptually adjacent (same subsystem) but does not import this harness.

## Notes

- `jest.resetModules()` is mandatory before re-importing; without it the module cache serves the instance built under the global (inflated) budgets.
- `withEnvironmentOverrides` is used instead of manual save/restore so that a failed import still restores the environment, preventing a leaked variable from corrupting a *later* test in the same file.
- `cookieParser` is included in `appAnswering` because some limiter key generators read `request.cookies` (mirroring the real app); omitting it would silently change the key identity under test.
- `trustProxyHop` is only relevant to the **address-block** dimension of rate limiting (resolving the client IP from `X-Forwarded-For`); it has no effect on key-based (e.g. cookie) budgeting.
