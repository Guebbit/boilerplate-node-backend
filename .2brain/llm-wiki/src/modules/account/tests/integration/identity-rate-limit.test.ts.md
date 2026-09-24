---
source: src/modules/account/tests/integration/identity-rate-limit.test.ts
sha256: a40824743bc276a1c2b3d445ca801607bce317a6e4931d020d5c8dc97788501a
generated_at: 2026-09-23T18:13:02.696456+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/identity-rate-limit.test.ts

## Purpose

Integration tests verifying that the account module's rate limiters enforce three independent budget dimensions — identity (submitted email), single address (IP), and address block (IPv4 /24 or IPv6 /64) — and that the MFA-challenge limiter correctly keys by challenge or falls back to the caller's block. The tests exercise the limiters in isolation (via trivial handlers) and also confirm they are actually mounted on the real `/account/signup` and `/account/reset` routes.

## Key elements

- **`withAccountRateLimits`** — Local wrapper around `withReloadedRateLimits` that pre-binds the dynamic import to `@modules/account/rate-limits`, so each test can set env-var overrides and receive a specific limiter export.
- **`describe('signupLimiters')`** — Asserts the identity budget is consumed per-unique-email on successful (201) signups, and the address budget is consumed across distinct emails from the same caller IP.
- **`describe('resetRequestLimiters')`** — Asserts the identity budget is consumed on every 200 response (matching `postResetRequest`'s indistinguishable-response design).
- **`describe('address-block keying')`** — Confirms that IPs within the same /24 (IPv4) or /64 (IPv6) share one block budget, while IPs in different subnets get separate budgets.
- **`describe('mfaChallengeLimiter')`** — Verifies per-challenge budgeting (6th guess → 429) and that requests with no challenge key on the caller's block rather than a shared anonymous bucket.
- **`describe('mounted on the real routes')`** — Hits the actual Express routes with `supertest` and asserts the `ratelimit` response header is present, proving the limiter arrays are wired to the router.

## Relationships

- **`src/modules/account/rate-limits.ts`** — The module under test. Each test dynamically imports it (via `withReloadedRateLimits`) with different `NODE_*` env overrides to isolate one budget dimension at a time.
- **`tests/support/rate-limit-harness.ts`** — Supplies `appAnswering` (builds a minimal Express app with the given limiters), `statusOf` (extracts the HTTP status from a supertest response), and `withReloadedRateLimits` (per-test env-var override + module re-import).
- **`tests/support/http.ts`** — Provides `api()` for the "mounted on real routes" section, which makes requests against the full application rather than a trivial handler.
- **`tests/support/setup-test-db.ts`** — Called once in the "mounted on real routes" block so the reset-route test can create a real user row.
- **`src/modules/users/tests/factories.ts`** — Supplies `createUser` and `PLAIN_PASSWORD` for the mounted-route assertions.

## Notes

- `jest.resetModules()` runs in every `afterEach`; this is required so the next test's `withReloadedRateLimits` can re-import `rate-limits.ts` with a fresh env-var set. Omitting it causes silent budget-carry-over between cases.
- The trivial-handler tests (all except "mounted on real routes") intentionally avoid the real route handlers — the doc comment states the property under test belongs to the limiter, not to `postSignup`/`postResetRequest`.
- A parallel test for the feedback module's `contactLimiters` lives at `src/modules/feedback/tests/integration/contact-identity-rate-limit.test.ts`; the two share the same three-dimension shape but are tested independently.
- `X-Forwarded-For` is used to simulate distinct client IPs; the limiter reads this header (or equivalent) for the address and block dimensions.
