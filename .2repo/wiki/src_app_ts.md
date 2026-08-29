# src/app.ts

## Purpose

Application entry point and Express server bootstrap. Validates the environment, connects all infrastructure (database, cache, queue, workers), initialises i18n, mounts the middleware stack in a load-bearing order, and listens. It also owns the graceful-shutdown path and the module-registry wiring that must complete before any route is reachable.

## Key elements

- **`app`** (exported) — the bare `express()` instance; other modules receive it to attach middleware or routes.
- **`startServer()`** (exported) — idempotent boot: validates env vars → starts DB, cache, queue, workers → registers locale directories → initialises `i18next` → applies/starts locale-override refresh → registers validation messages → calls `app.listen`. Returns the active `Server`.
- **`stopServer()`** (exported) — idempotent graceful shutdown; delegates to `shutdownInfra` and resets internal state.
- **`registerModules(enabledModules)`** — validates the module registry (dependency cycles, missing deps) and attaches domain-event handlers before the first route exists.
- **Middleware installation block** (top-level, runs at import time) — `installSecurity` → `installRequestContext` → `installTelemetry` → `installStatic` → conditional `installDemo` → `installRoutes` → `installErrorHandling`. Order is semantically significant (see Notes).
- **Auto-start guard** — when `NODE_ENV !== 'test'`, registers signal handlers and fires `startServer()` immediately.

## Relationships

- **`src/app/security`** — installed first; its `trust proxy` setting and rate-limiter keying affect every downstream middleware.
- **`src/app/request-context.ts`** — installed second; attaches request-id, observability handle, and negotiated locale that controllers in `src/app/routes.ts` read.
- **`src/app/telemetry`** — installed third; its timing middleware must wrap route handlers, not follow them.
- **`src/app/routes.ts`** — installed after telemetry/static/demo; provides the 404 catch-all that forces demo routes to be mounted before it.
- **`src/app/demo.ts`** — conditionally installed (only when `isDemoMode()`); exposes reset/outbox endpoints; must precede `installRoutes` or the 404 swallows them.
- **`src/app/error-handling.ts`** — installed last; Express error handlers only catch errors thrown by middleware registered before them.
- **`scripts/run-demo-server.ts`** — consumer of the demo-mode boot path (imports `app` / `startServer` to run the server in isolation).
- **`src/app/modules`** (`./modules`) — provides `enabledModules`, the list of module descriptors whose locale directories and registry entries are wired in here.

## Notes

- **OTel import ordering is load-bearing.** `startTracing()` must run before any transitive import of `express`, `http`, or `mongoose`; the file relies on ESM top-level execution order to guarantee this. Reordering imports silently breaks tracing.
- **Middleware order is behaviour, not convention.** The block is not a summary — Express applies handlers in registration order, and the relative positions of security, request-context, telemetry, demo, routes, and error-handling are each individually load-bearing (documented in the in-file comment).
- **`registerModules` runs at import time, not inside `startServer`.** A dependency-cycle or missing-module error therefore surfaces as an import-time crash, not a runtime 500.
- **Locale overlay refresh is awaited only for ordering.** `refreshLocaleOverrides` never rejects; the `await` exists to prevent the first request from being served un-overridden copy, not for correctness.
- **Demo mode is opt-in via environment.** Outside `npm run demo`, `isDemoMode()` returns false and no demo routes are mounted; the 404 catch-all in `installRoutes` is the only guard.
- **`stopServer` is safe to call multiple times.** It caches the in-flight promise and clears it in `.finally`, preventing double-teardown of DB connections or queue channels.
