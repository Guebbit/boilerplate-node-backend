---
source: tests/load/browse.js
sha256: 1ede7db00349ffa602cef59cb0800a7390be00394c72d19e2943edbece24f35b
generated_at: 2026-11-08T09:50:29.494231+00:00
model: ollama:qwen3.8:27b
---

# tests/load/browse.js

## Purpose

A k6 load test that simulates an anonymous visitor reading the storefront under rising load. Unlike `npm run bench` (flat concurrency, single URL, no assertions), this script ramps traffic, exercises multiple endpoints in a realistic sequence, and asserts pass/fail verdicts via thresholds so a shell script can gate or alert on results.

## Key elements

- **`options` (exported)** — k6 runner config: a 20 s ramp-up → 40 s hold at 20 VUs → 10 s ramp-down, plus `thresholds` for `p(95)<400` ms, `http_req_failed` rate < 1 %, and `checks` pass rate > 99 %.
- **`default()` (exported)** — the per-VU iteration. Walks two groups:
  - `catalogue` — `GET /products`, asserts 200 and non-empty `items` array; then follows the first item's `id` to `GET /products/:id` to exercise the detail/cache path.
  - `facets` — `GET /products/facets`, asserts 200.
- **`BASE_URL`** — read from `__ENV.BASE_URL`, defaults to `http://localhost:3000`.

## Relationships

No recorded graph neighbors.

## Notes

- **Thresholds are placeholders.** They are intentionally set at values the API "comfortably meets" so the suite passes on first run. Before trusting them, benchmark with `npm run bench`, read the p95, and set the threshold to roughly **1.4×** that number to leave regression headroom.
- **Not a merge gate.** Load results are machine-dependent and noisy on shared CI runners. Run manually against a controlled stack or on a dedicated nightly environment.
- **Ramp shape matters.** The rising edge is deliberate: it surfaces connection-pool exhaustion that a flat concurrency profile would miss.
- **`items.0.id` is a soft dependency.** If the list returns no items, the detail fetch is silently skipped — the test still passes as long as the list check itself holds.
- **Invocation:** `BASE_URL=http://localhost:3000 npm run bench:k6`.
