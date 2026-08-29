# tests/unit/infrastructure/http/middlewares/security.test.ts

## Purpose

Unit tests for the security middleware module (`security.ts`), pinning the numeric relationship between the two rate-limit budgets and the full authentication contract of `isMetricsScraper` — the standalone credential guard for the Prometheus metrics endpoint that bypasses the normal JWT flow.

## Key elements

- **`makeRequest(authorization?)`** — local helper that builds a stubbed Express `Request` (via `asStub`) whose `header()` returns the supplied Authorization value or `undefined`.
- **`describe('rate limit defaults')`** — asserts `DEFAULT_RATE_LIMIT_WINDOW_MS` is 60 s, `DEFAULT_RATE_LIMIT_MAX` is 100, and `DEFAULT_AUTH_RATE_LIMIT_MAX` is less than 1/5 of the browsing budget.
- **`describe('isMetricsScraper')`** — nine cases covering:
  - 503 when `NODE_METRICS_TOKEN` is unset *or* an empty string.
  - 200/`next()` only on an exact `Bearer <token>` match.
  - 401 for missing header, wrong scheme (`Basic`), bare token without `Bearer`, different-length token (must not throw), and a one-byte value difference (exercises `timingSafeEqual` directly).
- **`afterEach`** — restores or deletes `NODE_METRICS_TOKEN` so tests cannot leak the env var into one another.

## Relationships

- **`src/infrastructure/http/middlewares/security.ts`** — the module under test; this file imports `DEFAULT_RATE_LIMIT_MAX`, `DEFAULT_RATE_LIMIT_WINDOW_MS`, `DEFAULT_AUTH_RATE_LIMIT_MAX`, and `isMetricsScraper`.
- **`tests/support/stub.ts`** — provides `asStub`, used to create the fake `Request` object.
- **`tests/support/express.ts`** — provides `makeResponseStub`, used to capture `response.status(...)` calls without a real HTTP server.

## Notes

- The empty-string token case (`NODE_METRICS_TOKEN = ''`) is treated identically to the unset case (503). This is intentional: `!expected` in the source treats `''` as "not configured."
- The "different-length token must not throw" test exists specifically because `timingSafeEqual` throws on unequal-length inputs; removing the length pre-check in the source would turn every wrong-length probe into a 500 and a length oracle.
- Rate-limit assertions check the *ratio* between the two budgets, not absolute values, so the tests survive intentional re-tuning as long as the invariant (credential ≪ browsing) holds.
