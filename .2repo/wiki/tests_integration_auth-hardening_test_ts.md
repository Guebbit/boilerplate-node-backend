# tests/integration/auth-hardening.test.ts

## Purpose

Integration tests verifying two security-hardening properties that only manifest under attack: (1) credential endpoints carry a separate, small rate-limit budget distinct from the global API limiter, and (2) the 500 error handler never leaks internal implementation details to unauthenticated callers while still surfacing deliberately chosen error messages.

## Key elements

- **`limitersWithBudget(identityLimit, addressLimit?)`** — Helper that temporarily overrides `NODE_AUTH_RATE_LIMIT_MAX` / `NODE_AUTH_RATE_LIMIT_ADDRESS_MAX`, calls `jest.resetModules()`, dynamically re-imports the rate-limit module, then restores the original env values. Returns a freshly-constructed `credentialLimiters` tuple.
- **`describe('credential endpoints are rate limited separately')`** — Four tests:
  - 429 is returned once the per-identity budget (default 3) is exhausted.
  - Successful (200) responses do not decrement the budget (`skipSuccessfulRequests`).
  - Two different accounts at the same IP each get their own identity budget until the shared address budget is reached.
  - The limiter is actually mounted on the real `POST /account/login` route (asserts presence of the `ratelimit` response header).
- **`describe('the 500 handler')`** — Two tests:
  - An unhandled `Error` whose message contains a connection string / host name is stripped from the response; the client sees only a generic `INTERNAL_ERROR` code.
  - An `ExtendedError` with a deliberately chosen message (e.g. `"Pick a shorter name"`) is passed through to the client at its declared status.

## Relationships

- **`src/infrastructure/http/middlewares/rate-limit.ts`** — Dynamically imported (via `await import(...)`) after `jest.resetModules()` to obtain `credentialLimiters` built with test-specific budgets. The tests exercise this module's limiter behavior against a bare Express app.
- **`src/modules/users/tests/fixtures.ts`** — Provides `createUser` and `PLAIN_PASSWORD` used by the "mounted on the real login route" test to seed a user and issue a valid credential.
- **`tests/support/http.ts`** — Provides the `api()` helper (supertest bound to the full application) used to hit the real login endpoint and inspect its response headers.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` is called once at module scope to create an isolated database before any test runs.

## Notes

- The suite relies on `jest.resetModules()` + dynamic `import()` to re-evaluate the rate-limit module with different env-var budgets. The `afterEach(() => jest.resetModules())` in the first `describe` block is required so subsequent tests start from a clean module registry.
- Most limiter tests use a **trivial inline handler** (a one-liner that returns 401 or 200) rather than the real `postLogin` controller, keeping the assertion focused on the limiter's counting logic without a database round-trip per attempt.
- The "mounted on the real login route" test is the only one in the rate-limit suite that goes through the full app stack; it asserts only the `ratelimit` header's presence as proof the middleware ran.
- The 500-handler tests dynamically import `@app/error-handling` and `@infrastructure/http/errors` — these modules are not part of the listed graph neighbors but are resolved at test time.
