---
source: tests/load/hit.js
sha256: 4097844a5236ebc0ff6bc89947612d29a18d4ba74e89c62c1d8537078a31bc3e
generated_at: 2026-11-15T00:24:03.631219+00:00
model: ollama:qwen3.8:27b
---

# tests/load/hit.js

## Purpose

A minimal k6 load test that hammers a single URL at a constant virtual-user count and prints k6's summary (throughput, latency percentiles, failed-request rate). It powers the `npm run bench` script as a quick "how fast is this endpoint" check. Unlike journey-based tests, it ramps nothing, asserts nothing beyond a 2xx check, and applies no thresholds — it reports, it does not judge.

## Key elements

- **`TARGET`** – Resolved from `__ENV.TARGET`, falling back to `http://localhost:3000/products`. The npm script builds this from `NODE_PORT` plus the path argument.
- **`TOKEN`** – Optional bearer token from `__ENV.TOKEN`; when set, an `Authorization` header is added to every request.
- **`options`** (exported) – k6 execution config: constant `vus` (default 20) and `duration` (default `'30s'`), both overridable via env.
- **`default()`** (exported) – The per-iteration function: performs one `http.get(TARGET)` and runs a single `check` that the status is 2xx.

## Notes

- **No thresholds.** The `check` only records a pass/fail for reporting; it does not cause the run to fail. Expect exit code 0 even on a high error rate.
- **Constant VUs, no ramp.** Every virtual user fires the request in a tight loop for the full duration. There is no ramp-up/down phase.
- **Lighter alternative.** For a one-off check without k6 or a container, the header comment suggests `npx autocannon -c 20 -d 30 -l <url>` as an equivalent.
- **Default target is `/products`.** Running `npm run bench` with no path argument hits that endpoint; pass a path (e.g. `npm run bench /orders`) to change it.
