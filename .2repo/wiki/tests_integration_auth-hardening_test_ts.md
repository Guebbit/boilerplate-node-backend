# tests/integration/auth-hardening.test.ts

## Purpose

Integration tests that verify two security hardening properties on credential endpoints: (1) rate limiting is applied with separate identity and address budgets so that neither a single account nor a single IP can be used to brute-force credentials beyond a small budget, and (2) the uncaught-error handler never leaks internal error details (connection strings, filesystem paths) to the caller while still surfacing deliberately-chosen error messages.

## Key elements

- **`limitersWithBudget(identityLimit, addressLimit)`** — async helper that temporarily sets `NODE_AUTH_RATE_LIMIT_MAX` / `NODE_AUTH_RATE_LIMIT_ADDRESS_MAX`, calls `jest.resetModules()`, dynamically re-imports `credentialLimiters` from `security.ts`, then restores the original env vars. Necessary because `rateLimit()` reads its config once at module-evaluation time.
- **`describe('credential endpoints are rate limited separately')`** — four tests:
  - *rejects further attempts with 429 once the budget is spent* — confirms the limiter returns 429 after the identity budget is exhausted.
  - *does not spend the budget on successful attempts* — confirms `skipSuccessfulRequests` means 200s never count against the budget.
  - *budgets one account separately from another at the same address* — confirms identity and address are independent buckets (not a `email|ip` pair key).
  - *is mounted on the real login route* — uses the real `POST /account/login` via the `api` helper and asserts the `ratelimit` header is present.
- **`describe('the 500 handler')`** — two tests:
  - *tells the client nothing about what actually threw* — asserts internal details (hostnames, credentials) never appear in the 500 response body.
  - *still returns the copy a deliberate error carries* — asserts a deliberately thrown `ExtendedError` message reaches the client unchanged.

## Relationships

- **`src/infrastructure/http/middlewares/security.ts`** — dynamically imported (after `jest.resetModules()`) to obtain a freshly-constructed `credentialLimiters` object with the test-specific budgets.
- **`src/modules/users/tests/factory.ts`** — provides `createUser` and `PLAIN_PASSWORD`, used only by the "mounted on the real login route" test to create a valid user and authenticate.
- **`tests/support/http.ts`** — provides the `api` supertest helper that boots the real Express app for the integration test against `/account/login`.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` is called at module scope to initialise a clean database before any test runs.

## Notes

- The `limitersWithBudget` helper is a workaround for `rateLimit()` reading options once at construction. Without the `jest.resetModules()` + dynamic-import dance, the suite would inherit whatever budget `tests/support/setup.ts` set globally.
- All limiter tests (except the last) attach `credentialLimiters` to a **trivial** Express handler rather than a real controller, so each HTTP round-trip is cheap and the test isolates limiter behaviour from business logic.
- The identity/address budget values are deliberately asymmetric in the cross-account test (`3, 50`) so the test observes the identity bucket without the address bucket interfering.
