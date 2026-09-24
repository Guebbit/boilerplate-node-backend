---
source: src/modules/observability/services/parked-jobs.ts
sha256: cba4e4d43230cea2d439d916af1eb08833a8012b8dadb5d5ca6b4821d6174a83
generated_at: 2026-09-23T18:57:25.040026+00:00
model: ollama:qwen3.8:27b
---

# src/modules/observability/services/parked-jobs.ts

## Purpose

Provides the queue component of `GET /observability/health` by reading each worker queue's current dead-letter (parked) depth live from the broker. Unlike `dependency-health.ts`, this service performs I/O because parked counts exist only on the broker, not in process memory.

## Key elements

- **`queueHealth()`** — The sole export. A one-line wrapper that delegates to `parkedCounts()` from the queue adapter. Returns `Promise<ObservabilityHealthQueue[]>`, where a queue the adapter could not reach appears as an empty entry (not a zero-filled one), signalling "unknown" rather than "nothing is parked."

## Relationships

- **`@infrastructure/adapters/queue`** — Source of the `parkedCounts` function actually invoked; this file adds no logic beyond calling it.
- **`src/types/index.ts`** — Supplies the `ObservabilityHealthQueue` return-type annotation.
- **`src/modules/observability/services/index.ts`** — Barrel that re-exports `queueHealth` for consumers.
- **`src/modules/observability/controllers/get-observability-health.ts`** — The controller that calls `queueHealth()` to populate the `queues` field of the health response.
- **`src/modules/observability/tests/unit/parked-jobs.test.ts`** — Unit tests covering this module's behavior (primarily pass-through and error-shape assertions).

## Notes

- This file intentionally contains no branching or retry logic; all I/O semantics (timeout, partial-failure → empty entry) live inside `parkedCounts` in the queue adapter. If you need to understand "what happens when the broker is down," read the adapter's docblock, not this file.
- The empty-vs-zero distinction is a deliberate contract: downstream dashboards (see `docs/tools/prometheus.md`) treat an absent/empty entry as "data unavailable" and a zero as "genuinely nothing parked."
