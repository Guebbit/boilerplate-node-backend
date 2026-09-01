# src/modules/observability/module.ts

## Purpose

Module manifest that registers the operator-facing observability surface (health check, metrics overview, live SSE stream, Prometheus scrape endpoint, and audit trail) under the `/observability` base path. It exists to wire routes and locales into the kernel's app registry without owning any data itself.

## Key elements

- **`export default`** — An object satisfying `AppModule` from `@kernel/registry`. Declares `name: 'observability'`, `basePath: '/observability'`, `routes` (the Hono router from `./routes`), and a `locales` path. No event subscriptions or seeds are registered.
- **`router` (re-exported from `./routes`)** — The single Hono router carrying every observability endpoint. Authentication style varies per route; see `routes.ts` for details.

## Relationships

- **`src/kernel/registry.ts`** — Imports the `AppModule` type; this file's default export is consumed by the kernel's registry to mount the module.
- **`src/modules/observability/routes.ts`** — Imports `router`, the Hono router that this manifest attaches to the app.
- **`src/modules.ts`** — Aggregates this module's manifest alongside sibling modules (graph-level inclusion, not a direct import in this file).
- **`audit-logs` (external module)** — Serves `GET /observability/audit`; this module does not import it directly but depends on its presence at runtime.

## Notes

- **String-based metric reads.** This module reads domain counters via `metricsRegistry.getSingleMetric('auth_login_total')` (by string), never by importing the producing module. This is deliberate — it allows reporting on domains without naming them. The trade-off: renaming a counter compiles cleanly but breaks this module silently. `metric-names.test.ts` exists to guard against that.
- **No `index.ts`.** The module owns URLs, not data, so there is no public data surface to re-export to siblings.
- **Mixed auth styles.** Every route is authenticated, but not uniformly — `routes.ts` documents which style applies where.
