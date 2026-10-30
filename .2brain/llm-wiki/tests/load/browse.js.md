---
source: tests/load/browse.js
sha256: 1ede7db00349ffa602cef59cb0800a7390be00394c72d19e2943edbece24f35b
generated_at: 2026-10-29T07:05:09.364919+00:00
model: ollama:qwen3.8:27b
---

# tests/load/browse.js

## Purpose

A k6 load test that simulates an anonymous visitor browsing the storefront (catalogue listing, a product detail page, and facets). Unlike the single-endpoint autocannon benchmark (`npm run bench`), this script ramps concurrency, exercises multiple endpoints in sequence, and enforces pass/fail thresholds so the shell can act on a verdict rather than just reporting numbers.

## Key elements

- **`options`** — Exports the k6 scenario config: a 20s ramp to 20 VUs, 40s hold, 10s ramp-down. Thresholds assert `p(95) < 400 ms`, `< 1%` failed requests, and `> 99%` check pass rate.
- **`default()` (VU iteration)** — Runs two groups per VU tick:
  - **`group('catalogue')`** — GETs `/products`, checks for a 200 and a non-empty `items` array, then follows through to `/products/{first.id}` to exercise the detail-lookup path and its cache.
  - **`group('facets')`** — GETs `/products/facets` and asserts a 200.
- **`BASE_URL`** — Resolved from the `BASE_URL` env var (set via `__ENV.BASE_URL`), defaulting to `http://localhost:3000`.

## Relationships

No graph neighbors are recorded for this file. It is a leaf script invoked directly by the `bench:k6` npm command.

## Notes

- **Thresholds are placeholders.** The 400 ms / 0.01 / 0.99 values are intentionally lenient so the suite passes on first run. Replace them after measuring with `npm run bench` and setting p95 to roughly 1.4× the observed value.
- **Not a merge gate.** Load numbers are machine-dependent; on a shared CI runner alongside other jobs they are noise. Run manually against a controlled stack or on a fixed nightly environment.
- **The detail-page call is conditional.** If the listing returns zero items, the `/products/:id` request is skipped entirely, so a misconfigured or empty database silently reduces the test's coverage without failing.
- **k6, not autocannon.** This file uses the `k6/http` and `k6` modules; it is unrelated to the autocannon-based `bench` script except in intent.
