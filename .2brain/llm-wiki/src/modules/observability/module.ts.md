---
source: src/modules/observability/module.ts
sha256: 4337753319ff0078b14c3e02e8be7a65bb7911695532758fa8562777833cfa34
generated_at: 2026-09-27T15:04:28.783270+00:00
model: ollama:qwen3.8:27b
---

# src/modules/observability/module.ts

## Purpose

The module manifest for the **observability** module. It declares the module's identity, base path, permission, route table, required config, locales, and personal-data posture to the kernel registry so the service can mount and guard it. The file itself contains no runtime logic beyond a `path.join` for the locales directory.

## Key elements

- **`export default` (satisfies `AppModule`)** — the sole export. Fields of note:
  - `name` / `basePath` — registers as `observability` under `/observability`.
  - `permissions` — claims `platform.observability.any.read`; ownership is enforced by `tests/cross-cutting/module-permissions.test.ts`.
  - `routes` — the Hono/Fastify router re-exported from `./routes.ts`.
  - `requiredConfig` — `NODE_METRICS_TOKEN` with `minLength: 0`; the validation only *rejects* the known placeholder `change-me-dev-metrics-token`. An unset token is a valid fail-closed state (scrape returns 503).
  - `locales` — points to `./locales` (resolved at import time via `__dirname`).
  - `personalData` — `'none'`; the module owns no collection and records nothing personal.

## Relationships

- **`src/kernel/registry.ts`** — provides the `AppModule` type that this object must satisfy.
- **`src/modules.ts`** — aggregates module manifests; this file is one entry in that list.
- **`src/modules/observability/routes.ts`** — source of the `router` value; defines the actual HTTP handlers (health, metrics, SSE, audit, Prometheus scrape).
- **`src/modules/observability/asyncapi.yaml`** — API description for the module's endpoints; this manifest declares no event subscriptions, so the spec documents request/response contracts only.

## Notes

- **String-based metric reads.** This module (and its routes) reads counters from the shared Prometheus registry by *string* (`metricsRegistry.getSingleMetric('auth_login_total')`), never by typed import. Renaming a counter in any domain compiles cleanly but breaks observability silently; `metric-names.test.ts` is the guard.
- **`minLength: 0` is intentional.** It does not mean "no validation"; it means *only* the placeholder check applies. Do not raise `minLength` without also handling the unset case.
- **Barrel note.** `./index.ts` re-publishes `./services` (health, job/dependency health, process reader, SSE stream) for potential sibling-module consumption; no sibling currently imports them.
