# k6/browse.js

## Purpose

A k6 load test that simulates an anonymous visitor browsing the product storefront. Unlike the flat-concurrency autocannon bench (`npm run bench`), this script ramps VUs, walks multiple endpoints in a realistic sequence, and asserts pass/fail via `thresholds` so the shell can act on the result.

## Key elements

- **`options`** (exported) — Defines the load profile:
  - `stages`: ramp to 20 VUs over 20 s, hold 40 s, ramp down to 0 over 10 s.
  - `thresholds`: `p(95) < 400 ms` on `http_req_duration`, `< 1 %` on `http_req_failed`, `> 99 %` on `checks`. These are **placeholder values** (see Notes).
- **`default`** (exported VU iteration) — Two `group()` calls:
  - **`catalogue`** — `GET /products`, checks status 200 and non-empty `data.items`; then conditionally `GET /products/{firstId}` to exercise the id-lookup path.
  - **`facets`** — `GET /products/categories`, checks status 200.
- **`BASE_URL`** — Read from `__ENV.BASE_URL`, defaults to `http://localhost:3000`.

## Relationships

No dependency-graph neighbors. The script's only external dependency is the API under test (the three product endpoints above). It is conceptually paired with the autocannon bench (`npm run bench`) as a complementary tool, but neither file imports the other.

## Notes

- **Thresholds are intentional placeholders.** They are set low enough to pass so the suite isn't deleted on day one. Before relying on the verdict, measure real p95 with `npm run bench` and set the `p(95)` threshold to roughly **1.4×** that number. The multiplier exists to leave headroom so the test catches regressions, not noise.
- **Not a merge gate.** Load results are machine-dependent; on a shared CI runner alongside other jobs the numbers are noise. Run manually against a stack you control or on a nightly schedule against a fixed environment.
- The detail-page request inside the `catalogue` group is **skipped** if the list response has no items, so the id-lookup path is only exercised when data is present.
- Invoke with `BASE_URL=… k6 run k6/browse.js`.
