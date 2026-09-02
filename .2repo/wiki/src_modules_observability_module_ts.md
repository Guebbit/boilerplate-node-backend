# src/modules/observability/module.ts

## Purpose

Module manifest for the `observability` module. Registers the module's identity (name, base path, routes, locales, required config) with the kernel so the service can serve operator-facing endpoints: health, a metrics overview, the live SSE stream, the Prometheus scrape endpoint, and the audit trail.

## Key elements

- **Default export** — a plain object satisfying the `AppModule` interface from `@kernel/registry`. Declares `name`, `basePath: '/observability'`, `routes`, `requiredConfig`, and `locales`.
- **`routes`** — imported from `./routes`; the actual route tree mounted under `/observability`.
- **`requiredConfig`** — a single entry for `NODE_METRICS_TOKEN`. `minLength: 0` is intentional: an *unset* token is a valid fail-closed state (scrape returns 503). The check exists only to refuse boot when the token is set to the shipped placeholder `change-me-dev-metrics-token`.
- **`locales`** — resolved via `path.join(__dirname, 'locales')`; no i18n strings are owned here beyond pointing at the directory.

## Relationships

- **`src/kernel/registry.ts`** — supplies the `AppModule` type that the default export `satisfies`. The kernel consumes this manifest to wire the module into the service.
- **`src/modules.ts`** — top-level module aggregator; this file is one of the module entries it collects.
- **`src/modules/observability/routes.ts`** — provides the `router` that this manifest attaches to `basePath`. All URL definitions, auth styles, and handler logic live there; this file only *declares* the module.

## Notes

- **No `index.ts`.** This module deliberately owns URLs, not data. There is no barrel file to promise a sibling module an import surface.
- **String-based metric reads.** The module reads domain counters by string off the shared `metricsRegistry` (e.g. `metricsRegistry.getSingleMetric('auth_login_total')`) rather than by typed import. Renaming a counter elsewhere compiles cleanly but breaks this module silently — `metric-names.test.ts` is the safety net.
- **Auth is not uniform across routes.** Each route in `routes.ts` may use a different authentication style; this manifest does not enforce a single scheme.
