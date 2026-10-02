---
source: src/app.ts
sha256: c4310b9b64c006860a8cf20fb0a082e6da282b4eef966cf4540d4ae977760b1b
generated_at: 2026-10-01T12:43:52.282822+00:00
model: ollama:qwen3.8:27b
---

# src/app.ts

## Purpose

Factory module that builds a single Express application instance. `createApp()` synchronously assembles the middleware stack, registers all enabled modules and their config, and returns an `AppInstance` carrying the Express object plus `boot`/`start`/`stop` lifecycle functions. It is the one place where infrastructure adapters (cache, queue, i18n, workers) are wired to the HTTP server, and the one place where middleware registration order is fixed.

## Key elements

- **`createApp(): AppInstance`** — Synchronous builder. Validates module config, registers modules via `registerModules`, installs the full middleware chain, and closes over per-instance state (`activeServer`, `shutdownPromise`). Callable multiple times; each call is an independent instance.
- **`AppInstance`** — Interface returned by `createApp`. Fields:
  - `app: Express` — the mounted application; usable immediately (e.g. by a supertest agent) without calling `boot` or `start`.
  - `boot()` — Starts database → cache → queue → workers → i18n → template dirs → locale overrides → validation messages. Does **not** bind a port.
  - `start()` — Calls `boot()`, optionally restores the demo scenario, then `listenOn`. Idempotent: returns the existing server if already listening.
  - `stop()` — Graceful shutdown via `shutdownInfra`. Memoised so concurrent callers (signal handler + test `afterAll`) share one promise.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/app/config.ts` | Imports `APP_CONFIG_SLICES` (per-module config slices) and `securityTxtSettings` (validated at build time). |
| `src/app/security.ts` | Imports `installSecurity`, `installRequestParsing`, `applyServerTimeouts`; mounted first in the middleware chain. |
| `src/app/static-assets.ts` | Imports `installStatic`; mounted before rate-limiting so static files don't consume request budget. |
| `src/app/request-context.ts` | Imports `installRequestContext`; mounted before routes so controllers can read request-id/locale. |
| `src/app/telemetry.ts` | Imports `installTelemetry`; mounted before routes so its timer wraps handlers. |
| `src/app/routes.ts` | Imports `installRoutes`; mounted after telemetry, before error handling. |
| `src/app/demo.ts` | Imports `installDemo` (mounted before `installRoutes` so the 404 catch-all doesn't swallow it) and `restoreScenario` (called during `start` in demo mode). |
| `src/app/error-handling.ts` | Imports `installErrorHandling`; mounted last — Express error handlers only catch errors thrown by middleware registered before them. |
| `src/app/security-txt.ts` | Imports `securityTxtWarning`; called at build time, logs a warning (not an error) if the boilerplate is stale. |
| `src/app/workers.ts` | Imports `registerWorkers`; invoked inside `boot()`. |
| `src/infrastructure/adapters/cache.ts` | Imports `startCache`; called inside `boot()`. |
| `src/infrastructure/adapters/queue.ts` | Imports `startQueue`; called inside `boot()`. |
| `src/infrastructure/adapters/logger.ts` | Imports `logger`; used for lifecycle log lines and warnings. |
| `src/infrastructure/adapters/mailer.ts` | Imports `registerTemplateDirectories`; called inside `boot()` with `enabledModuleTemplateDirectories()`. |
| `scenarios/apply.ts` | External caller: invokes `createApp()` then `boot()` (never `start()`) so it can drive real flows against its own loopback listener without binding `NODE_PORT`. |

## Notes

- **OTel import order is the file's primary constraint.** `startTracing()` must run before `express`, `http`, or `mongoose` are imported. This only holds when `cluster.ts` (the process entry point) imports this file *dynamically*; a static import would hoist the Express import above the `startTracing()` call and silently break tracing.
- **`createApp` is synchronous.** No async work happens at build time. A caller that only needs the `Express` object (e.g. `tests/support/http.ts`) can skip `boot`/`start` entirely.
- **Middleware order is behavioural, not decorative.** The registration sequence in the file *is* the request pipeline. Reordering any `install*` call changes runtime semantics (rate-limiting, error catching, telemetry timing).
- **`stop` is safe to call concurrently.** The in-flight promise is cached in the closure; a second call joins the first rather than closing the server twice.
- **`NODE_HOST` unset binds every interface.** The demo profile sets it to loopback because its tokens use a hard-coded public secret; all other profiles intentionally bind `0.0.0.0`.
- **Missing `locales` module is a valid deployment.** The file logs an informational line ("content is monolingual") rather than treating it as a misconfiguration.
