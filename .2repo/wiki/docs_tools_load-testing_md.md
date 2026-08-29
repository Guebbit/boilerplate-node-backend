# docs/tools/load-testing.md

## Purpose

Documents how to generate external load against the running API using autocannon, explains the two benchmark npm scripts (`bench` / `bench:search`), and guides the reader on which observability signals to correlate during a run. It exists so that load testing, result interpretation, and the rationale for external generation are recorded in one place.

## Key elements

- **autocannon** — the load generator; a devDependency. Nothing load-testing-related ships in the server.
- **`npm run bench`** — GET `/products`, exercises the Redis-cached read path (`setCache(3600, …)`). Expect low, flat latency and `x-cache: HIT`.
- **`npm run bench:search`** — POST `/products/search`, uncached, runs a regex query against Mongo. The path that moves `http_request_duration_milliseconds` and shows DB time in traces.
- **Default run parameters** — 20 connections, 30 s duration, `-l` (latency histogram), port read from `NODE_PORT` (default 3000).
- **Observability checklist** — Grafana RED panels, `nodejs_eventloop_lag_seconds`, `http_requests_in_flight`, Tempo spans, Loki log lines; all describe the same traffic as autocannon's client-side output.
- **Interpretation guidance** — check non-2xx first (rate limiter in `middlewares/security.ts`), read p97.5/p99 not mean, compare runs rather than absolute numbers.
- **Rationale for external generation** — in-process generation would block the event loop, misrepresent the stack, and require extra routes/models.

## Relationships

- **docs/tools/index.md** — parent index page; this file is listed as a sub-topic under the tools documentation.

## Notes

- The two scripts are deliberately different code paths (cached vs. uncached); running them back-to-back is the intended demo.
- npm scripts are starting points, not a wrapper — any endpoint, header, or concurrency level can be driven by invoking `npx autocannon` directly.
- A run with great latency but a high 429/503 ratio is measuring the rate limiter, not the endpoint.
- Disagreement between autocannon's client-side percentiles and Grafana server-side percentiles indicates queueing outside the app (proxy, connection pool, event loop).
