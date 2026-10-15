---
source: src/modules/observability/module.ts
sha256: c4cb2d75373882c323e15cbddd0463bb0fd04b3db4a3dbd33fb27b2b6d02f92c
generated_at: 2026-10-15T10:55:36.430484+00:00
model: ollama:qwen3.8:27b
---

# src/modules/observability/module.ts

## Purpose

Module manifest for the **observability** module. It wires the operator-facing surface — health checks, metrics overview, live SSE stream, Prometheus scrape endpoint, and audit trail — into the kernel's module registry. It does no business logic itself; it declares *what* the module exposes (routes, config, locales) and *where* those live in sibling files.

## Key elements

- **`export default { … } satisfies AppModule`** — the manifest object consumed by the kernel. Declares:
  - `name: 'observability'`, `basePath: '/observability'`
  - `routes: router` (from `./routes`)
  - `config: [observabilityConfig.slice]` (from `./config`)
  - `locales` path
  - `personalData: 'none'` — the module records no personal data
- **`import './metrics'`** — side-effect import; registers the `dependency_up` gauge with the shared metrics registry at module load time.
- **`import { router } from './routes'`** — pulls in the assembled Express router.
- **`import { observabilityConfig } from './config'`** — pulls in the config slice (scrape-token gate, telemetry sinks).
- **`import type { AppModule } from '@kernel/registry'`** — type-only import for the `satisfies` assertion.

## Relationships

- **`src/kernel/registry.ts`** — supplies the `AppModule` type; the default export is registered into the kernel's module table.
- **`src/modules.ts`** — upstream barrel that re-exports this module's manifest so the kernel can discover it.
- **`src/modules/observability/routes.ts`** — provides the `router` referenced in the manifest; defines all authenticated endpoints (health, metrics, SSE, Prometheus, audit).
- **`src/modules/observability/config.ts`** — provides the `observabilityConfig` slice consumed at startup.
- **`src/modules/observability/metrics.ts`** — imported purely for its side-effect (gauge registration); no value is used.

`src/modules/observability/asyncapi.yaml` is a sibling schema artifact and is not imported by this file.

## Notes

- **String-based metric reads (by design).** This module reads other domains' counters via `metricsRegistry.getSingleMetric('auth_login_total')` etc. — always by string, never by import. Renaming a counter in a domain module compiles cleanly but breaks observability silently. `metric-names.test.ts` guards against this.
- **Side-effect import order matters.** The `import './metrics'` line must execute before any route handler fires; it is a load-time registration, not a lazy init.
- **No event subscriptions, no seeds.** The manifest intentionally omits both; this module is read-only infrastructure.
- **The `./index.ts` barrel** (not this file) republishes `./services` (health, job/dependency health, process reader, SSE stream) for potential sibling reuse. Nothing consumes that barrel today.
