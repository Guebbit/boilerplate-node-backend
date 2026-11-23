---
source: src/modules/observability/module.ts
source_sha256: 24f8a96412c507cea06c4b6ea7bcbcca0896f2e39b31cd4992d91c616c5a5fcf
context_sha256: f59cf64d78cd2cdc280006868a18f6691b44f253de7a79603a437a8894934b69
generated_at: 2026-11-22T06:02:06.742089+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/observability/module.ts

## Purpose
Manifest entry for the `observability` module: the operator-facing view of the running service. It covers health, a metrics overview, the live SSE stream, the Prometheus scrape endpoint, and the audit trail. It wires the module's routes, config and locales into the kernel's module registry.

## Key elements
- **Default export** (`satisfies AppModule`): the module manifest.
  - `name: 'observability'`.
  - `mounts`: the API `router` at `/observability`.
  - `workerMounts`: `workerRouter` at `/observability`, so the scrape is also served on the worker's port (the worker moves counters the API doesn't).
  - `config`: `[observabilityConfig.slice]`, covering the scrape token's placeholder gate and the telemetry sinks.
  - `locales`: the `locales` directory next to the file.
  - `personalData: 'none'`: infrastructure only; it owns no collection of its own.
- **Side-effect import `./metrics`**: registers the `dependency_up` gauge with the metrics registry at module load.

The manifest declares no event subscriptions and no seeds.

## Relationships
- `src/kernel/registry.ts`: supplies the `AppModule` type that the manifest must satisfy.
- `src/modules.ts`: the module list that picks up this manifest.
- `src/modules/observability/routes.ts`: provides `router`, the API routes. Every route is authenticated, but the auth style differs between routes (see `routes.ts`).
- `src/modules/observability/worker-routes.ts`: provides `workerRouter`, the worker-port scrape.
- `src/modules/observability/config.ts`: provides `observabilityConfig`, whose `slice` is registered.
- `src/modules/observability/metrics.ts`: imported only for its registration side effect.
- `src/modules/audit-logs/module.ts`: the module this one depends on for `GET /observability/audit`. The audit rows written here belong to `audit-logs`.

## Notes
- The Prometheus registry and the HTTP counters stay in `infrastructure/observability`, because every module registers onto that one registry.
- This module reads other domains' counters by string name from the shared registry, e.g. `getSingleMetric('auth_login_total')`, and never imports them. Renaming a counter still compiles but silently breaks the reporting. `metric-names.test.ts` exists to catch this.
- The `./metrics` import must stay even though nothing from it is used, since the gauge registers when the file loads.
