---
source: tests/support/rate-limit-harness.ts
sha256: 4189106c60ee8e374b96f8ce2430fd4a2196c76ee940e9034aa4d217822e1cb8
generated_at: 2026-09-23T20:13:07.610603+00:00
model: ollama:qwen3.8:27b
---

# tests/support/rate-limit-harness.ts

## Purpose

A minimal Express app harness for exercising `express-rate-limit` middleware in isolation over real HTTP (via supertest). It exists because neither the stub app in `tests/support/express.ts` (no real middleware runs) nor the fully mounted app in `tests/support/http.ts` (routing, auth, serialization) provides the right level of fidelity: a rate limiter's behaviour is a property of the middleware itself, and `no-restricted-imports` classifies that as an integration concern.

## Key elements

- **`withReloadedRateLimits`** – Reloads a rate-limit module under environment-variable overrides and returns a caller-chosen slice of it. Uses `jest.resetModules()` because `express-rate-limit` reads its config once at import; without a fresh import the budget is already fixed by `tests/support/setup.ts`. Wraps the work in `withEnvironmentOverrides` so env vars are restored even if the import throws.
- **`appAnswering(status, trustProxyHop, ...limiters)`** – Builds a single-route Express app (`POST /route`) that applies the given `RequestHandler[]` chain and then always responds with the given status. `trustProxyHop` toggles `app.set('trust proxy', 1)` so `X-Forwarded-For` becomes `request.ip`, matching `NODE_TRUST_PROXY_HOPS` in production.
- **`statusOf(pending)`** – Awaits a pending supertest request and returns only its numeric status, decoupling the assertion from the request object.

## Relationships

- **`tests/support/environment.ts`** – Direct dependency; provides `withEnvironmentOverrides` which guarantees env-var restoration around the dynamic import.
- **`src/modules/account/tests/integration/identity-rate-limit.test.ts`** – Consumer; calls `withReloadedRateLimits` with a loader for the account rate-limit module and feeds the returned limiters into `appAnswering`.
- **`src/modules/feedback/tests/integration/contact-identity-rate-limit.test.ts`** / **`submission-rate-limit.test.ts`** – Consumers; same pattern for the feedback module's limiters.
- **`src/modules/payments/tests/integration/payment-velocity.test.ts`** – Consumer; drives the payments velocity limiter through this harness.
- **`tests/integration/auth-hardening.test.ts`** / **`tests/integration/concurrency/auth-races.test.ts`** – Consumers; exercise auth-related rate limits (e.g. brute-force, race-condition) via `appAnswering` and `statusOf`.

## Notes

- `express-rate-limit` locks its budget at module-import time. Any test that needs a non-default budget **must** go through `withReloadedRateLimits` (which calls `jest.resetModules()`); importing the limiter module a second time without that reset returns the cached instance.
- `trustProxyHop` is only meaningful for the **address-BLOCK** dimension of a limiter (keyed on `request.ip`). Count-based limiting keyed on a header or body field does not need it.
- The harness intentionally omits auth, serialization, and routing logic. If a test's property under test involves any of those, this is the wrong harness.
- `statusOf` exists so tests can capture the status of a request that was fired _before_ a limiter's window expires, without the await blocking the next dispatch.
