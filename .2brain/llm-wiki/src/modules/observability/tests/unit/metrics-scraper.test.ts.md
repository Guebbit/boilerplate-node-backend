---
source: src/modules/observability/tests/unit/metrics-scraper.test.ts
source_sha256: 1f5c607bb0fc787fca01b022a4c9afc9c14f26bb4d1808df52e26cd58249d74c
context_sha256: 8e92cfdd92fedae09080ee2ada688b0c2f093ee68b9e65032002572f04425662
generated_at: 2026-11-22T06:05:57.943297+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/observability/tests/unit/metrics-scraper.test.ts

## Purpose
Unit tests for `isMetricsScraper`, the credential guard on `GET /observability/metrics`. This guard is the only credential check that bypasses the JWT middleware (Prometheus cannot log in). The tests pin three properties: deny by default, a required `Bearer` scheme, and no throw on length mismatches.

## Key elements
- `makeRequest(authorization?)` — builds a stub Express `Request` through `asStub<Request>` whose `header()` returns the given value only for `authorization` (case-insensitive name match).
- `describe('isMetricsScraper')` — eight cases, each setting `NODE_METRICS_TOKEN` via `setEnvironment`, calling the middleware with a response stub and a `jest.fn()` `next`, then asserting on `response.status` and `next`:
  - Token unset → 503, `next` not called.
  - Empty-string token (with `Bearer ` header) → 503, treated as unconfigured.
  - Exact `Bearer scrape-me` → `next` called once, no status written.
  - Bare token, `Basic` scheme, or missing header → 401.
  - Wrong-length token → 401 and does not throw. `timingSafeEqual` throws on unequal lengths, so the length check must be folded into the match.
  - Equal-length token differing by one byte (`scrape-mf`) → 401. This reaches `timingSafeEqual` instead of being short-circuited by the length guard.

## Relationships
- `src/modules/observability/metrics-scraper.ts` — the module under test; `isMetricsScraper` is imported from it.
- `tests/support/environment.ts` — supplies `setEnvironment`, used to set or unset `NODE_METRICS_TOKEN`.
- `tests/support/express.ts` — supplies `makeResponseStub`, which captures the status and body written by `rejectResponse` without an HTTP server.
- `tests/support/stub.ts` — supplies `asStub`, used to cast the partial request object to `Request`.

## Notes
- The tests call the middleware directly, with no HTTP server, so the 503 and 401 behaviour is checked only at the unit level.
- The comment above `makeRequest` mentions capturing the status/body pair, but `makeRequest` only builds the request. The response capture is done by `makeResponseStub`.
- The file imports `setEnvironment` and never resets it explicitly. Any cleanup of `NODE_METRICS_TOKEN` between tests depends on the support helper or Jest config, which isn't visible here.
