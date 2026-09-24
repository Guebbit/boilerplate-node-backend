---
source: tests/load/browse.js
sha256: 89340a0e8d351c52b947f149ce044144970ed8ba2a1af84bbeec6654ddc3b03e
generated_at: 2026-09-23T20:09:00.212071+00:00
model: ollama:qwen3.8:27b
---

# tests/load/browse.js

## Purpose

A k6 load test that simulates an anonymous visitor browsing the storefront under a ramped VU profile. Unlike the autocannon benchmark (`npm run bench`), this script walks multiple endpoints, exercises realistic request chains (list → detail), and asserts pass/fail thresholds so the shell can act on a verdict rather than just a number.

## Key elements

- **`options` (exported)** — k6 stage configuration (20 s ramp-up → 40 s hold at 20 VUs → 10 s ramp-down) and three thresholds: `p(95) < 400 ms` response time, `< 1 %` non-2xx/3xx, and `> 99 %` check pass rate.
- **Default export (test scenario)** — two k6 `group` blocks:
    - _catalogue_: `GET /products`, then extracts the first item's id and issues `GET /products/:id` to exercise the detail lookup and its cache.
    - _facets_: `GET /products/categories`.
- **`BASE_URL`** — read from `__ENV.BASE_URL`, defaults to `http://localhost:3000`.

## Relationships

No graph neighbors are recorded for this file. It is a standalone k6 script invoked externally (`k6 run k6/browse.js`) and does not import from or export to any other module in the repo.

## Notes

- **Thresholds are deliberate placeholders.** They are set to values the API comfortably meets so the suite doesn't fail on first run. Replace them after measuring real p95 with `npm run bench` and applying roughly a 1.4× headroom multiplier.
- **Not a merge gate.** Results are machine-dependent; on a shared CI runner they are noise. Run manually against a stack you control or on a fixed nightly environment.
- **k6, not Node.** Despite the `.js` extension, this is a k6 script (uses `k6/http`, `k6` built-ins, `__ENV`). It cannot be executed with `node`.
- The detail-page request is conditional: if the list response is missing or `data.items.0.id` is falsy, only the list check fires for that iteration.
