# tests/unit/infrastructure/http/middlewares/rate-limit.test.ts

## Purpose

Unit tests that pin two things about the rate-limit module: (1) the structural relationship between the three default budgets (browsing, credential, submission), and (2) the full behaviour of `isMetricsScraper`, the only auth check in the codebase that bypasses the JWT middleware. The scraper tests exist at unit level because "deny by default" is a security invariant that must not depend on an integration suite running.

## Key elements

- **`makeRequest(authorization?)`** — builds a minimal Express `Request` stub (via `asStub`) whose `header()` returns the given `Authorization` value or `undefined`.
- **`describe('rate limit defaults')`** — three assertions: window is 60 000 ms; `DEFAULT_AUTH_RATE_LIMIT_MAX` < `DEFAULT_RATE_LIMIT_MAX / 5`; `DEFAULT_SUBMISSION_RATE_LIMIT_MAX` < `DEFAULT_RATE_LIMIT_MAX / 5`. Pins the *ratio*, not just the absolute values.
- **`describe('isMetricsScraper')`** — eight cases covering: no/empty token → 503; correct `Bearer <token>` → `next()` called; bare token → 401; wrong scheme → 401; missing header → 401; different-length token → 401 without throwing; equal-length wrong token → 401; empty configured token → 503.
- **`afterEach`** — restores `process.env.NODE_METRICS_TOKEN` to its pre-test value (or deletes it) to prevent cross-test contamination.

## Relationships

- **`src/infrastructure/http/middlewares/rate-limit.ts`** — the module under test. This file imports the four `DEFAULT_*` constants and `isMetricsScraper` from it.
- **`tests/support/express.ts`** — provides `makeResponseStub()`, which captures `status()` and body calls without spinning up a real HTTP server.
- **`tests/support/stub.ts`** — provides `asStub<T>()`, used here to shape the fake `Request` object.

## Notes

- Deliberately does **not** exercise `express-rate-limit`'s middleware (i.e., no request actually spends the budget). That path would require importing the rate-limiter, which the project's `no-restricted-imports` rule classifies as integration-level. See `tests/integration/submission-rate-limit.test.ts` for that coverage.
- The "length mismatch must not throw" test exists because `crypto.timingSafeEqual` raises on unequal-length inputs; the production code guards against this by folding a length comparison into the boolean first. Removing that guard would turn every wrong-length token into a 500 *and* a length oracle.
- Budget tests assert a strict inequality (`< max / 5`) rather than an exact value, so the constants can be tuned independently as long as the credential/submission budgets stay well below the browsing budget.
