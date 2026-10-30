---
source: src/modules/observability/module.ts
sha256: f308b5f17c2c6bda3ae857ad975e6ca64324635a123895cb240175516e5ee33d
generated_at: 2026-10-29T04:35:41.113842+00:00
model: ollama:qwen3.8:27b
---

# src/modules/observability/module.ts

## Purpose

Module manifest for the operator-facing observability surface (health, metrics overview, SSE stream, Prometheus scrape endpoint, audit trail). It wires the router, config slice, and locales into the kernel's `AppModule` contract and registers the `dependency_up` gauge as a side-effect import. It owns no domain collection and records no personal data.

## Key elements

- **Default export (`AppModule`)** — declares `name: 'observability'`, mounts the router at `/observability`, exposes `observabilityConfig.slice` as the module's config, points `locales` at a `./locales` directory, and sets `personalData: 'none'`.
- **`import './metrics'`** — side-effect import; at module load this registers the `dependency_up` gauge with the shared Prometheus registry.
- **`router` (from `./routes`)** — the single Express router for all observability endpoints (health, metrics, SSE, scrape, audit). Auth style varies per route; see `routes.ts`.
- **`observabilityConfig` (from `./config`)** — provides the scrape-token placeholder gate and telemetry-sink configuration.

## Relationships

- **`src/kernel/registry.ts`** — supplies the `AppModule` type that the default export satisfies; the kernel consumes this manifest to mount the router and resolve config.
- **`src/modules.ts`** — top-level module registry; this manifest is one of the entries it assembles into the running application.
- **`src/modules/observability/routes.ts`** — provides the `router` instance mounted at `/observability`.
- **`src/modules/observability/config.ts`** — provides `observabilityConfig.slice`, consumed by the kernel's config-resolution step.
- **`src/modules/observability/metrics.ts`** — imported for its side effect (gauge registration); not otherwise referenced at runtime.
- **`src/modules/observability/asyncapi.yaml`** — API contract for the endpoints this module exposes; kept alongside for spec documentation.
- **`audit-logs` module** (not in the graph list above but referenced in the doc comment) — supplies the `GET /observability/audit` handler; this module depends on it but owns no audit collection.

## Notes

- **String-based metric reads.** This module reads every domain's counters by string key off the shared registry (e.g. `metricsRegistry.getSingleMetric('auth_login_total')`) rather than by import. Renaming a counter in its source domain compiles cleanly but breaks reporting here silently. `metric-names.test.ts` exists specifically to guard against this.
- **Barrel republishing.** The module's `./index.ts` re-exports `./services` (health, job/dependency health, process reader, SSE stream) for potential sibling consumption, though no sibling currently imports them.
- **No event subscriptions or seeds.** The manifest deliberately omits `events` and `seeds` fields; this is a read-only, infrastructure-style module.
