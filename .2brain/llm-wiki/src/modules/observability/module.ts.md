---
source: src/modules/observability/module.ts
sha256: f308b5f17c2c6bda3ae857ad975e6ca64324635a123895cb240175516e5ee33d
generated_at: 2026-11-08T06:39:56.505083+00:00
model: ollama:qwen3.8:27b
---

# src/modules/observability/module.ts

## Purpose
Module manifest that registers the observability module with the kernel. It declares the route mount point (`/observability`), pulls in the config slice (scrape-token gate, telemetry sinks), points to a locales directory, and triggers the side-effect registration of the `dependency_up` gauge. It owns no data collection of its own.

## Key elements
- **Default export** (`AppModule`): the manifest object satisfying the kernel's `AppModule` interface. Fields:
  - `name: 'observability'`
  - `mounts` — mounts `router` (from `./routes`) at base path `/observability`.
  - `config` — exposes `observabilityConfig.slice` (scrape token placeholder, telemetry sink config).
  - `locales` — absolute path to a sibling `locales/` directory.
  - `personalData: 'none'` — the module records no personal data.
- **Side-effect import of `./metrics`** — registers the `dependency_up` gauge with the shared metrics registry at module load.
- **Import of `router` from `./routes`** — the authenticated operator-facing route handlers (health, metrics overview, SSE stream, Prometheus scrape, audit trail).
- **Import of `observabilityConfig` from `./config`** — the config slice definition.

## Relationships
- **`src/kernel/registry.ts`** — imports the `AppModule` type; this file's default export satisfies that contract.
- **`src/modules/observability/routes.ts`** — provides the `router` that this manifest mounts at `/observability`.
- **`src/modules/observability/config.ts`** — provides `observabilityConfig` whose `.slice` is declared in the manifest.
- **`src/modules/observability/metrics.ts`** — imported purely for its side effect (gauge registration); no value is imported.
- **`src/modules.ts`** — consumes this file's default export to include the module in the application's module list (reverse dependency; not an import *from* this file).

## Notes
- **Metrics are read by string name, never by import.** E.g. `metricsRegistry.getSingleMetric('auth_login_total')`. This is deliberate: it lets this module report on any domain's counters without a static import. The trade-off is that renaming a counter compiles cleanly but breaks the observability view at runtime — the safety net is `metric-names.test.ts`.
- **Route authentication is inconsistent by design.** Each route in `./routes` authenticates, but the style differs per route (see `routes.ts` for specifics).
- **`./metrics` is a side-effect import.** It exists solely to register a gauge at load time; removing it silently drops the gauge.
- **`./index.ts` (barrel)** republishes the services layer (health, job/dependency health, process reader, SSE stream) for a sibling module that may need them; no consumer exists today.
