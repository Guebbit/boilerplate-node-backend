---
source: src/modules/observability/services/health.ts
sha256: a59729bde97151e8a2d7bfdca375fdfd8e6ba27052a09286741ac59a8b271cc9
generated_at: 2026-09-27T15:05:13.385747+00:00
model: ollama:qwen3.8:27b
---

# src/modules/observability/services/health.ts

## Purpose

Assembles the full payload for `GET /observability/health` by composing per-service health checks (jobs, queues, dependencies) with process and system metrics into a single `ObservabilityHealth` object. It lives here rather than in the controller so the payload's shape is co-located with the services whose output it aggregates.

## Key elements

- **`buildObservabilityHealth()`** (exported) — Single async function returning `Promise<ObservabilityHealth>`. Calls `jobHealth()` and `queueHealth()` in parallel via `Promise.all`, then synchronously gathers `processSnapshot()`, `dependencyHealth()`, and `resolveAnalyticsProvider()`, and returns a flat object containing:
  - `status` — folded from all dependency states via `overallStatus` (e.g. one down → `"degraded"`).
  - `dependencies` — per-service `{ status }` objects for `database`, `cache`, `queue` (object shape so latency/last-error can be added without a breaking change).
  - `telemetry` — boolean config flags (`loki`, `otel`, `umami`, `faro`) plus an `analytics` block with the resolved provider name and a `configured` check. Deliberately separate from `dependencies` because these are wiring flags, not liveness probes.
  - `memory` — bytes, same four fields as the SSE stream.
  - `system` — `os.platform()`, `os.cpus().length`, `os.loadavg()`.
  - `jobs` / `queues` — pass-through from `jobHealth()` / `queueHealth()`.

## Relationships

- **`./dependency-health.ts`** — imports `dependencyHealth()` (per-service state) and `overallStatus()` (folding logic for the top-level `status`).
- **`./job-health.ts`** — imports `jobHealth()` for the `jobs` section.
- **`./parked-jobs.ts`** — imports `queueHealth()` (dead-letter depths) for the `queues` section.
- **`./process-snapshot.ts`** — imports `processSnapshot()` for `uptimeSeconds` and `memory`.
- **`@infrastructure/observability/analytics`** — imports `resolveAnalyticsProvider()` to report which analytics backend is active and whether it is fully configured.
- **`@types`** — imports the `ObservabilityHealth` interface that defines the return shape.
- **`../controllers/get-observability-health.ts`** — the HTTP controller that invokes `buildObservabilityHealth()` and serializes the result (implied by the module doc comment; the controller does no assembly of its own).
- **`./index.ts`** — barrel re-export so other modules can import `buildObservabilityHealth` from the services index.

## Notes

- `telemetry` booleans are **config presence** checks (`Boolean(process.env.NODE_LOKI_HOST)` etc.), not reachability probes. Do not add network calls here.
- The `analytics` sub-block distinguishes *selected provider* from *provider is actually usable*. A provider selected without credentials logs a one-time warning and silently drops events for the process lifetime; this endpoint surfaces that gap.
- `umami` / `faro` under `telemetry` describe **frontend** observability wiring (script origin, collector URL), not the backend's own analytics path.
- Memory is reported in **bytes** to stay 1:1 with the SSE health stream; dashboards should not need unit conversion.
- The function is a plain arrow (no `class`), always returns a `Promise`, and has no side effects beyond reading `process.env` and calling the imported getters.
