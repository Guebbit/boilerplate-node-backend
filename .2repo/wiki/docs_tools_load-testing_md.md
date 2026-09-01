# docs/tools/load-testing.md

## Purpose

Documents how to run external load tests (via `autocannon`) against the running server and how to read the results alongside the observability stack (Grafana, Prometheus, Tempo, Loki). Exists to give a single, repeatable procedure and to explain *why* load must be generated from outside the process.

## Key elements

- **`npm run bench`** — hits `GET /products` (cached read path via `setCache` in `routes/products.ts`); measures cache + HTTP stack.
- **`npm run bench:search`** — hits `POST /products/search` (uncached, regex query against Mongo); exercises DB time and moves `http_request_duration_milliseconds`.
- **Both scripts** use 20 connections × 30 s, print a latency histogram (`-l`), and read `NODE_PORT` (default `3000`).
- **`autocannon`** — devDependency only; nothing load-testing–related ships in the server bundle.
- **`middlewares/rate-limit.ts`** — can produce 429s that distort latency percentiles if not raised for a run.

## Relationships

- **`docs/tools/package-scripts.md`** — defines the `bench`, `bench:search`, `compose:restart`, and `dev` npm scripts referenced here as entry points.
- **`docs/reference/tests.md`** — covers the broader test strategy (unit/integration/E2E); this file is the load/perf complement, not a unit-test artifact.

## Notes

- The two scripts are **deliberately different code paths** (cached vs uncached). Running both back-to-back is the intended "same service, two shapes" demo.
- The npm scripts are starting points, not a wrapper — any shape of load can be run by invoking `npx autocannon` directly with custom flags, headers, or endpoints.
- **Non-2xx ratio is the first thing to check.** A run showing good latency but 40 % `429` is measuring the rate limiter, not the endpoint.
- Interpret p97.5/p99, not the mean.
- Absolute numbers are meaningless across environments (laptop vs prod); use runs to compare *relative* change.
- In-process load generation is explicitly rejected: it blocks the event loop (causing `/health`/`/metrics` gaps), measures internal loops rather than the real stack, and adds route/model surface area for a job a CLI tool does better.
