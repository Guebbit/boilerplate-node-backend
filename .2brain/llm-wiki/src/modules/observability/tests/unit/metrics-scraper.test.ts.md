---
source: src/modules/observability/tests/unit/metrics-scraper.test.ts
sha256: 072b8615dbe87762979c7a035e0bf4a327d207cd5950f59b0ac975738d5c0ee9
generated_at: 2026-09-23T18:58:44.367340+00:00
model: ollama:qwen3.8:27b
---

# src/modules/observability/tests/unit/metrics-scraper.test.ts

## Purpose

Unit tests for `isMetricsScraper`, the bearer-token credential guard on `GET /observability/metrics`. The tests pin down three security properties that each fail silently if broken: default-deny when no token is configured, rejection of tokens without the `Bearer` scheme, and safe handling of length-mismatched tokens (preventing both a 500 and a timing oracle).

## Key elements

- **`makeRequest(authorization?)`** – local helper that builds a minimal Express `Request` stub (via `asStub`) whose `header()` returns the given `Authorization` value or `undefined`.
- **`originalToken`** – captures `process.env.NODE_METRICS_TOKEN` before the suite runs so `afterEach` can restore or delete it.
- **`describe('isMetricsScraper')`** – eight `it` blocks covering:
  - 503 when `NODE_METRICS_TOKEN` is unset or empty.
  - `next()` called exactly once for a correct `Bearer <token>` header.
  - 401 for a bare token (no scheme), a wrong scheme (`Basic`), or a missing header.
  - No throw + 401 when the supplied token has a different length than the configured one (guards `timingSafeEqual`'s length assertion).
  - 401 for an equal-length token differing in one byte (proves the comparison actually reaches `timingSafeEqual`).

## Relationships

- **`src/modules/observability/metrics-scraper.ts`** – the system under test; this file imports `isMetricsScraper` and drives it with stubbed `req`/`res`/`next`.
- **`tests/support/stub.ts`** – provides `asStub`, used to construct the fake `Request` object.
- **`tests/support/express.ts`** – provides `makeResponseStub`, which records `status()` calls so assertions can inspect the response code without a live server.

## Notes

- Status semantics: **503** means "endpoint not configured" (no token in env), **401** means "credential present but wrong". Tests assert both codes explicitly; do not conflate them.
- The length-mismatch test and the equal-length-different-byte test are intentionally separate: the first catches the `timingSafeEqual` throw, the second confirms the comparison isn't short-circuited by the length guard.
- `NODE_METRICS_TOKEN` is read from `process.env` at call time (not captured at import time), so each test sets it independently and `afterEach` restores the original.
