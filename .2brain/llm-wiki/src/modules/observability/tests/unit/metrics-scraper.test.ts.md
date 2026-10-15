---
source: src/modules/observability/tests/unit/metrics-scraper.test.ts
sha256: 79c75452fd8464f4db23755ca6ca0bf4868646558ba6e9fd6edcfbd7091375e5
generated_at: 2026-10-15T10:58:05.303869+00:00
model: ollama:qwen3.8:27b
---

# src/modules/observability/tests/unit/metrics-scraper.test.ts

## Purpose

Unit tests for `isMetricsScraper`, the credential guard protecting `GET /observability/metrics`. This is the only auth check in the codebase that bypasses JWT middleware (Prometheus cannot log in), so the tests pin three security properties that each fail silently if broken: deny-by-default, Bearer-scheme enforcement, and safe length-mismatch handling.

## Key elements

- **`makeRequest(authorization?)`** — local helper that builds a stubbed Express `Request` via `asStub`, returning the supplied string only for the `authorization` header (case-insensitive).
- **`describe('isMetricsScraper', …)`** — eight cases:
  - *No token configured* → 503, `next` not called.
  - *Exact `Bearer <token>` match* → `next` called once, no status set.
  - *Right token, no scheme* → 401.
  - *Wrong scheme (`Basic`)* → 401.
  - *Missing Authorization header* → 401.
  - *Length-mismatch token* → 401, **and** the call must not throw (guards against `timingSafeEqual` throwing on unequal lengths, which would be a 500 and a length oracle).
  - *Equal-length token differing in one byte* → 401 (exercises `timingSafeEqual` past the length guard).
  - *Empty-string configured token* → 503 (treated as unconfigured).

## Relationships

- **`src/modules/observability/metrics-scraper.ts`** — source of `isMetricsScraper`, the unit under test.
- **`tests/support/environment.ts`** — provides `setEnvironment`, used to set or clear `NODE_METRICS_TOKEN` per test.
- **`tests/support/express.ts`** — provides `makeResponseStub`, the fake `Response` used to assert `.status()` calls.
- **`tests/support/stub.ts`** — provides `asStub`, used to build the minimal `Request` object.

## Notes

- The length-mismatch test asserts **both** that no exception is thrown *and* that a 401 is returned; either alone would miss a regression (a throw means a 500, a 401-without-guard means the oracle is still live via error-handling paths).
- An empty string for `NODE_METRICS_TOKEN` is intentionally treated as *unconfigured* (503), not as a valid zero-length credential.
- Each test calls `setEnvironment` with a fresh value; there is no `beforeEach`/`afterEach` reset — isolation relies on every test setting the variable it needs.
