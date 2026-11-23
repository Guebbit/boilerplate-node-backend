---
source: src/modules/observability/worker-routes.ts
source_sha256: 5643ec5e7e1674cb6690c3b2e6ad301d320f3634a491fa11fa18167f47f208e6
context_sha256: da09600ea4066c31b309f9af944ae961dbd56e536e68eaa956e1fce18010b3eb
generated_at: 2026-11-22T06:06:42.598750+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/observability/worker-routes.ts

## Purpose
Defines the Express router served by the worker process for the `observability` module. It exposes only the Prometheus scrape endpoint. Two alert counters (`queue_jobs_dead_lettered_total`, `webhook_delivery_attempts_total`) are updated only in the worker, so without this route nothing would be able to read them.

## Key elements
- `workerRouter` — an Express `Router` with one route: `GET /metrics`. It is documented as mounted at `/observability`.
- Route chain: `isMetricsScraper` (the static-credential guard) followed by `getObservabilityMetrics` (the scrape handler).

## Relationships
- `src/modules/observability/metrics-scraper.ts` — supplies `isMetricsScraper`, the credential guard in front of the route.
- `src/modules/observability/controllers/get-observability-metrics.ts` — supplies `getObservabilityMetrics`, the handler that serves the scrape.
- `src/modules/observability/module.ts` and `src/modules/observability/tests/unit/routes.test.ts` — neighbors in the graph. Neither is referenced in this file's content, so the wiring and test coverage are not visible here.

## Notes
- This router should stay minimal. It deliberately serves only the scrape and nothing else.
- The file header says the API's own router mounts the same guard and handler at the same path, so a scraper authenticates against the worker the same way it does against the API. Changes to the guard or handler therefore affect both processes.
- The header describes the two-process (API and worker) context, with the worker serving only the scrape.
