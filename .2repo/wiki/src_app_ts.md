# src/app.ts

## Purpose

The process entry point. It constructs the Express application, wires all infrastructure (tracing, database, cache, queue, i18n), registers the module registry, mounts the full middleware/route stack in its load-bearing order, and owns the start/stop lifecycle. The file's primary structural constraint is that OTel must initialize before any module it instruments is imported.

## Key elements

- **`app`** (exported) — the bare `express()` instance shared by every `install*` call.
- **`startServer`** (exported) — boot sequence: DB → cache → queue → workers → i18n init → locale-override refresh → validation-message registration → `app.listen`. Returns the active `Server`. Idempotent if already listening.
- **`stopServer`** (exported) — wraps `shutdownInfra` in a single-shot promise so concurrent calls (e.g. two SIGINTs) collapse into one execution.
- **`getPort`** — reads `NODE_PORT` via `environmentNumber`, falls back to `3000`.
- **`registerModules(enabledModules)`** — called at module scope, before any `install*`; validates the registry and wires domain-event handlers. A cycle or missing dependency halts boot here rather than surfacing as a runtime 500.
- **Middleware install order** (module-scope, top to bottom): `installSecurity` → `installRequestContext` → `installTelemetry` → `installStatic` → conditional `installDemo` → `installRoutes` → `installErrorHandling`. This sequence *is* the runtime behaviour.
- **Auto-start guard** — when `NODE_ENV !== 'test'`, registers signal handlers and fires `startServer()` immediately.

## Relationships

- **`@app/security`** — `installSecurity` runs first because `trust proxy` defines what `request.ip` means for the rate limiter that follows.
- **`@app/request-context`** — attaches request id, observability handle, and negotiated locale that every downstream controller reads.
- **`@app/telemetry`** — its timer must wrap the route handlers, so it precedes `installRoutes`.
- **`@app/static-assets`** — served before route matching so static files short-circuit.
- **`@app/demo`** — `isDemoMode()` gates the control surface (reset + outbox); mounted before `installRoutes` so the 404 catch-all doesn't swallow it.
- **`@app/routes`** — the application's HTTP surface; must come after context/telemetry and before error handling.
- **`@app/error-handling`** — Express error handlers only catch errors from middleware registered *before* them, so this is always last.
- **`@app/workers`** — `registerWorkers` is called in the boot chain after queue is up.
- **`@infrastructure/adapters/cache`** — `startCache` is the second boot step.
- **`@infrastructure/adapters/queue`** — `startQueue` is the third.
- **`@infrastructure/adapters/logger`** — used for the server-start/error log lines.
- **`@infrastructure/http/validation-messages`** — `registerValidationMessages` resolves its copy through `i18next.t`, so it must run after i18n init.
- **`@infrastructure/i18n/index.ts`** — supplies `getDefaultLocale`, `getFallbackLocale`, `listSupportedLocales`, `loadLocaleResources`, `registerLocaleDirectories`, `refreshLocaleOverrides`, `startLocaleOverrideRefresh`.
- **`@infrastructure/i18n/catalog.ts`** — the dictionary files that `listSupportedLocales` / `loadLocaleResources` discover at build time.
- **`@infrastructure/adapters/demo-outbox`** — exercised indirectly through the demo module's reset endpoint; not imported here directly.

## Notes

- **OTel ordering is the one non-negotiable rule in the file.** `startTracing()` is called before `express`, `mongoose`, or any other instrumentable package is imported. Moving it later silently breaks tracing.
- **Locale directories are registered before `i18next.init`.** Modules own their locale paths; `infrastructure` cannot discover them, so `app.ts` hands them in. Forgetting a `locales` field on a module means its strings are invisible to the translator.
- **`refreshLocaleOverrides` is awaited for ordering, not for correctness.** An empty overlay is a valid state; the await simply prevents the first few requests from answering with un-overridden copy.
- **`installDemo` is conditional on `isDemoMode()`.** In production the demo routes (reset, outbox) are absent; the 404 catch-all in `installRoutes` would otherwise swallow them if they were mounted later.
- **`stopServer` resets both `activeServer` and `shutdownPromise` in `.finally`**, so a second call after shutdown can re-initialise cleanly (useful in test teardown).
