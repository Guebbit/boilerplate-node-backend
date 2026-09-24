---
source: src/app.ts
sha256: 699e323317ecab07e92cf1e063e2399efc896aa455210dd3fa2f46b187eebeb5
generated_at: 2026-09-23T17:34:55.773679+00:00
model: ollama:qwen3.8:27b
---

# src/app.ts

## Purpose

Process entry point that builds the Express app, wires all infrastructure (OTel tracing, database, cache, queue, i18n), mounts every enabled module, installs the middleware stack, and owns the start/stop lifecycle. The file exists primarily to preserve one ordering constraint: OTel must initialize before `express`, `http`, or `mongoose` are imported. Everything else is sequencing.

## Key elements

- **`app`** (exported) – The `express` application instance. Imported directly by tests and `scenarios/apply.ts`, which drive flows without binding a port.
- **`bootInfrastructure()`** (exported) – Sequentially starts database → cache → queue → workers → i18n (locale dirs, `i18next.init`, `refreshLocaleOverrides`, `startLocaleOverrideRefresh`) → validation messages. Separate from `startServer` so that `scenarios/apply.ts` can boot the real stack on a loopback listener without touching `NODE_PORT`.
- **`startServer()`** (exported) – Idempotent boot: calls `bootInfrastructure`, optionally `restoreScenario()` in demo mode, then binds the port. Resolves with the running `Server` on a second call rather than binding twice.
- **`stopServer()`** (exported) – Graceful shutdown via `shutdownInfra`. The in-flight promise is memoised so a signal handler and a test `afterAll` share one shutdown.
- **`registerModules(enabledModules, APP_NON_MODULE_CHECKS)`** – Runs at import time (not inside `startServer`). Validates the module registry and attaches domain-event handlers before any route exists.
- **`setTranslatables(…)` / `setPersonalDataSections(…)`** – Resolve cross-module lookups at the app tier (which *can* import every module) and hand them into `locales` and `account` respectively, keeping the kernel boundary free of module imports.
- **Middleware installation block** – Fixed call sequence: `installSecurity` → `installRequestContext` → `installTelemetry` → `installStatic` → `installDemo` (conditional on demo mode) → `installRoutes` → `installErrorHandling`. The order *is* the behaviour; see Notes.
- **Auto-start guard** – At the bottom of the file, `registerSignalHandlers` + `startServer` fire unless `NODE_ENV === 'test'` or `NODE_APP_NO_LISTEN === '1'`.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/infrastructure` (otel-sdk, database, environment, server-lifecycle, validation-messages, i18n, demo-profile) | Imported for `startTracing`, `start`, `environmentNumber`, `shutdownInfra`/`registerSignalHandlers`, `registerValidationMessages`, locale helpers, and `isDemoMode`. |
| `src/infrastructure/adapters/cache.ts` | `startCache()` called inside `bootInfrastructure`. |
| `src/infrastructure/adapters/queue.ts` | `startQueue()` called inside `bootInfrastructure`. |
| `src/infrastructure/adapters/logger.ts` | `logger` used for boot/shutdown log lines. |
| `src/app/security.ts` | `installSecurity(app)` and `applyServerTimeouts(server)` called here. |
| `src/app/request-context.ts` | `installRequestContext(app)` called here. |
| `src/app/telemetry.ts` | `installTelemetry(app)` called here. |
| `src/app/static-assets.ts` | `installStatic(app)` called here. |
| `src/app/demo.ts` | `installDemo(app)` and `restoreScenario()` called conditionally on `isDemoMode()`. |
| `src/app/routes.ts` | `installRoutes(app)` called here. |
| `src/app/error-handling.ts` | `installErrorHandling(app)` called here. |
| `src/app/workers.ts` | `registerWorkers()` called inside `bootInfrastructure`. |
| `src/app/required-config.ts` | `APP_NON_MODULE_CHECKS` passed to `registerModules`. |
| `scenarios/apply.ts` | Imports `app` and `bootInfrastructure` directly; sets `NODE_APP_NO_LISTEN=1` to suppress the auto-start and drives flows on its own loopback listener. |

## Notes

- **Import order is the contract.** `startTracing()` is called before `express`, `mongoose`, etc. are imported. Reordering the import block breaks tracing without a type error.
- **Middleware order is load-bearing.** Security must precede routes (it sets `trust proxy`, which determines `request.ip` for the rate limiter). Request-context must precede routes (controllers read the id/locale it attaches). Telemetry must precede routes (its timer wraps the handler). Error-handling must be last (Express error handlers only catch errors thrown by middleware registered *before* them). Demo endpoints must precede routes (the 404 catch-all would swallow them).
- **`autoIndex` is off in production.** Indexes are reconciled by a separate `db:sync` setup service before this process starts. Dev/test keep Mongoose's default (on) so test suites get constraints for free.
- **`refreshLocaleOverrides` is awaited for ordering, not correctness.** It never rejects, but a request arriving between `i18next.init` and the first refresh would get un-overridden copy.
- **The file *is* the side effect.** Importing it registers modules, sets translatables/personal-data sections, installs middleware, and (unless guarded) starts listening. There is no export that signals "skip the server" — the environment variable `NODE_APP_NO_LISTEN` is the only channel.
- **`shutdownPromise` memoisation** means a SIGINT handler and a Jest `afterAll` that both call `stopServer` will share one teardown rather than racing two.
- **Port binding:** `NODE_HOST` unset → binds all interfaces (every non-demo profile). The demo profile sets it to loopback because its tokens are signed with a public hard-coded secret.
