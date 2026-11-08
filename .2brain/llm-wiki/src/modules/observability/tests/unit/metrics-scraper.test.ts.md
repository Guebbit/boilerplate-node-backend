---
source: src/modules/observability/tests/unit/metrics-scraper.test.ts
sha256: 79c75452fd8464f4db23755ca6ca0bf4868646558ba6e9fd6edcfbd7091375e5
generated_at: 2026-11-08T06:44:04.455841+00:00
model: ollama:qwen3.8:27b
---

# src/modules/observability/tests/unit/metrics-scraper.test.ts

## Purpose

Unit tests for `isMetricsScraper`, the credential guard protecting `GET /observability/metrics`. Because Prometheus scrapers cannot authenticate via JWT, this middleware is the sole gate on an endpoint that exposes operational state; these tests pin three security invariants—deny-by-default when unconfigured, mandatory `Bearer` scheme, and length-safe comparison—so that silent regressions in any single property are caught at the unit level rather than only in integration.

## Key elements

- **`makeRequest(authorization?)`** — local helper that builds a stub `Request` whose `.header()` returns the given `authorization` value only for the `authorization` header name (case-insensitive); all other header lookups return `undefined`.
- **`describe('isMetricsScraper')`** — eight cases, each asserting the `response.status` call and whether `next` was invoked:
  - *No token configured* → 503, `next` not called.
  - *Exact token with `Bearer`* → `next` called once, no status set.
  - *Token without scheme* → 401.
  - *Wrong scheme (`Basic`)* → 401.
  - *Missing `Authorization` header* → 401.
  - *Different-length token* → 401, and the function must not throw (guards against `timingSafeEqual` throwing on unequal lengths).
  - *Equal-length, one-byte-different token* → 401 (exercises the value comparison path, not just the length guard).
  - *Empty-string configured token* → 503 (treated as unconfigured via the `!expected` check).

## Relationships

- **`src/modules/observability/metrics-scraper.ts`** — the system under test; the file imports and calls `isMetricsScraper` in every case.
- **`tests/support/environment.ts`** — provides `setEnvironment`, used in each test to set or unset `NODE_METRICS_TOKEN` in isolation.
- **`tests/support/express.ts`** — provides `makeResponseStub`, which captures `status()` and body calls so assertions can verify the response without spinning up a server.
- **`tests/support/stub.ts`** — provides `asStub`, used to wrap the partial `Request` object into a type-safe stub.

## Notes

- Path aliases `@tests/stub`, `@tests/express`, and `@tests/environment` are used instead of relative paths; the alias mapping is configured in the project's `tsconfig` / Jest config.
- The leading JSDoc block is a design rationale, not a spec. Each of its three bullets maps to at least one test; removing or weakening the implementation guard for any bullet will break the corresponding test, but the comment is the first thing a reader sees.
- The "different-length" and "equal-length, one-byte-different" tests are intentionally paired: together they prove the length guard and the value comparison are independent rejection paths. Removing the length guard alone will not cause a test failure for the equal-length case, but the different-length case will start throwing (surfacing as an unhandled exception rather than a 401).
- `setEnvironment` mutates shared state; tests rely on Jest's default serial execution and do not call `setEnvironment` in a `beforeEach`/`afterEach` block. If tests are ever parallelised, this will need guarding.
