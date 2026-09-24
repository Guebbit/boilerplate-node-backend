---
source: src/modules/observability/module.ts
sha256: e1e58d3f6136aa2f4f2526e021c2727b8cd3964d110e8e838cb9f6a71da24956
generated_at: 2026-09-23T18:56:24.127773+00:00
model: ollama:qwen3.8:27b
---

# src/modules/observability/module.ts

## Purpose
Module manifest for the operator-facing observability module. Declares the module's identity (name, base path), its single permission key, its HTTP router, required boot config, locale path, and personal-data classification so the kernel can mount and govern it. Owns no data and exposes no events — it is purely a URL and permission surface.

## Key elements
- **`default` export** — an object typed as `AppModule`. Carries:
  - `name: 'observability'`, `basePath: '/observability'`
  - `permissions: ['platform.observability.any.read']` — the sole permission this module introduces; cross-cutting tests enforce bidirectional attribution.
  - `routes: router` — the Hono/express router imported from `./routes`.
  - `requiredConfig` — guards against the shipped placeholder `change-me-dev-metrics-token`; `minLength: 0` is intentional so an *unset* variable is allowed (fail-closed by default) while the known placeholder blocks boot.
  - `locales`, `personalData: 'none'`.

## Relationships
- **`src/kernel/registry.ts`** — provides the `AppModule` type this manifest must satisfy; the kernel reads this object to register the module.
- **`src/modules.ts`** — top-level aggregation that imports this module's default export alongside other module manifests.
- **`src/modules/observability/routes.ts`** — supplies the `router` instance attached here; all route handlers, auth guards, and endpoint logic live there.
- **`src/modules/observability/asyncapi.yaml`** — the API contract document for this module's endpoints (SSE stream, Prometheus scrape, health, audit).

## Notes
- **Metric reads are string-based, never import-based.** The module calls `metricsRegistry.getSingleMetric('auth_login_total')` etc. by name. Renaming a counter in any domain compiles cleanly but silently zeroes out the reported value. `metric-names.test.ts` exists specifically to catch this.
- **The barrel (`index.ts`) is intentionally empty.** This module exports no data or reusable utilities to siblings — it owns URLs, not logic.
- **Auth is per-route, not uniform.** Every endpoint is authenticated, but the mechanism varies (session, bearer, scraper token). See `routes.ts` for the actual guard wiring.
- **Depends on `audit-logs`** for the `GET /observability/audit` endpoint, but that dependency is at the route-handler level, not visible in this manifest file.
