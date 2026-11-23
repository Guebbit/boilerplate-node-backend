---
source: src/infrastructure/observability/metrics-database.ts
source_sha256: 1b84716c6aa77734300e3aa3080271d7a2bc5490c078dd3904d1b4f23b132434
context_sha256: baf643ab6bed3d5169fa9244c9af590bd592a4e31c4ae1e7e72817588723b914
generated_at: 2026-11-22T02:59:05.847363+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/observability/metrics-database.ts

## Purpose
Defines the Prometheus metrics for the database layer. At present that is a single counter for queries that mongod killed at their time limit. A timed-out query surfaces as a 503, the same as an outage. Without its own series, the 5xx alert cannot tell "slow" from "down".

## Key elements
- `queryTimeoutsTotal`: a `prom-client` `Counter` that counts queries stopped at `maxTimeMS` (mongod error 50).
  - It is built from `counterConfig(...)`, using the generated metric definition for this counter.
  - It is registered on `metricsRegistry`.
  - It has no labels.

## Relationships
- `src/infrastructure/observability/metrics-registry.ts`: supplies `metricsRegistry`, the registry the counter is attached to.
- `src/infrastructure/observability/metric-config.ts`: supplies `counterConfig`, which turns the generated metric definition into `Counter` options.
- The neighbors `src/app/error-handling.ts`, `src/infrastructure/http/errors.ts` and `tests/unit/infrastructure/http/errors.test.ts` are linked in the dependency graph. This file does not import them, and nothing in its content shows how they interact with it.

## Notes
- The counter is meant to be incremented "where the answer is derived", meaning where the timeout is detected. The increment is not in this file.
- It is deliberately unlabelled. The log line carries the operation name.
- A rate above zero means a query shape is too slow for the limit, or the database is saturated.
- The module header points to a Prometheus operations doc, section "what-observability-metrics-exposes", for the operational documentation.
