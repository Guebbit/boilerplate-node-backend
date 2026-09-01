# tests/unit/infrastructure/http/middlewares/rate-limit.test.ts

## Purpose

Unit tests for the rate-limit middleware's default constants and for `isMetricsScraper`, the sole credential check that bypasses the JWT pipeline (Prometheus cannot log in). The tests pin the relationship between the two rate-limit budgets and exhaustively cover every reject/accept path of the scrape guard, including the `timingSafeEqual` length-mismatch edge case.

## Key elements

- **`makeRequest(authorization?)`** — local factory returning an `asStub<Request>` whose `header()` method returns the supplied `authorization` string for the `Authorization` key and `undefined` otherwise. Avoids spinning up an HTTP server.
- **`afterEach` env restore** — saves `process.env.NODE_METRICS_TOKEN` before the suite and restores (or deletes) it after every test, preventing cross-test leakage.
- **`describe('rate limit defaults')`**
  - Asserts `DEFAULT_RATE_LIMIT_WINDOW_MS === 60_000` and `DEFAULT_RATE_LIMIT_MAX === 100`.
  - Asserts `DEFAULT_AUTH_RATE_LIMIT_MAX < DEFAULT_RATE_LIMIT_MAX / 5`, pinning the *relationship* (credential budget is a small fraction) rather than a hard number.
- **`describe('isMetricsScraper')`** — eight tests:
  - No token configured → `503`, `next` not called.
  - Exact `Bearer <token>` → `next` called once, no status written.
  - Bare token (no `Bearer` scheme) → `401`.
  - Wrong scheme (`Basic`) with correct value → `401`.
  - Missing `Authorization` header → `401`.
  - Correct scheme, different length → must not throw; returns `401`.
  - Equal length, one byte differs → `401` (proves the guard is not just the length check).
  - Empty string as configured token → treated as unconfigured, `503`.

## Relationships

- **`src/infrastructure/http/middlewares/rate-limit.ts`** — the system under test. Imports `DEFAULT_RATE_LIMIT_MAX`, `DEFAULT_RATE_LIMIT_WINDOW_MS`, `DEFAULT_AUTH_RATE_LIMIT_MAX`, and `isMetricsScraper`.
- **`tests/support/express.ts`** — provides `makeResponseStub()`, a minimal Express `Response` stub that records `status()` and `json()` calls so assertions can inspect the written status code without a real socket.
- **`tests/support/stub.ts`** — provides `asStub<T>()`, the generic partial-mock helper used to build the fake `Request` object.

## Notes

- The length-mismatch test (`Bearer short` vs. `scrape-me`) exists specifically to catch the case where `timingSafeEqual` throws on unequal-length inputs, which would surface as a 500 **and** act as a length oracle. Removing the length guard in the implementation will make this test fail with an uncaught exception rather than a clean assertion error.
- The empty-token test documents an intentional convention: `NODE_METRICS_TOKEN=''` is equivalent to unset (503), not a valid credential.
- Tests mutate `process.env` directly; they are order-independent only because of the `afterEach` restore. Running them in parallel with other suites that touch the same variable could interfere.
