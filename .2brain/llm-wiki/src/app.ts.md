---
source: src/app.ts
sha256: 8fef2030bb934f4ad03a5c3a5d2309280cf9ad4f8a46d254f89b1d65329d5928
generated_at: 2026-10-29T01:49:36.995372+00:00
model: ollama:qwen3.8:27b
---

# src/app.ts

## Purpose

Application factory. `createApp()` builds a fully-configured Express instance — infrastructure (database, cache, queue, i18n, templates), the middleware stack, and every enabled module's routes — and returns a `boot`/`start`/`stop` lifecycle. The file exists as the single composition root so that OTel initialises before any module it instruments is imported, and so that callers (tests, scenarios, the real server) can pull exactly the lifecycle step they need without side effects leaking into the import itself.

## Key elements

- **`startTracing()`** — called at module top-level, *before* the `express` import. Must execute before `express`, `http`, and `mongoose` are loaded; only guaranteed when `cluster.ts` dynamically imports this file.
- **`createApp(options?): AppInstance`** — synchronous factory. Validates module config, registers domain-event handlers, invokes each module's `onRegistered` hook, mounts the middleware stack and routes. Returns an independent instance per call (no shared mutable state across calls).
- **`AppInstance.boot()`** — starts database → cache → queue → workers → i18n → template directories → locale overrides (one-shot + periodic refresh) → validation messages. Does **not** bind a port.
- **`AppInstance.start()`** — `boot()` + optional `extension.afterBoot()` + `listenOn(app, NODE_PORT, NODE_HOST)`. Idempotent: a second call while already listening resolves with the running `Server`.
- **`AppInstance.stop()`** — graceful shutdown. Memoises the in-flight promise so concurrent callers share one drain; settles outbox nudges before closing the socket.
- **`AppExtension`** — `{ install?, afterBoot? }` escape hatch. Only the demo profile (`scenarios/run-server.ts`) passes one; production never does.
- **`AppOptions.env`** — per-call environment overrides applied via `installEnvironment`. Process-wide in effect (last caller wins) because config slices are read at import time by downstream modules.
- **Middleware ordering** (all mounted synchronously inside `createApp`): `installRequestContext` → `requestIdMiddleware` → `installSecurity` / `installRequestParsing` → `installTelemetry` → `installStatic` → `attachLocale` → `installRoutes` → `installErrorHandling`.
- **`applyServerTimeouts(server)`** — called immediately after `listenOn` resolves, before the first request can arrive.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/app/config.ts` | Supplies `APP_CONFIG_SLICES` used to validate each module's required config at build time. |
| `src/app/security.ts` | `installSecurity`, `installRequestParsing`, `applyServerTimeouts` — mounted in the middleware stack / applied to the socket. |
| `src/app/request-context.ts` | `installRequestContext`, `requestIdMiddleware` — early middleware, sets per-request context. |
| `src/app/telemetry.ts` | `installTelemetry` — request-level telemetry hooks. |
| `src/app/static-assets.ts` | `installStatic` — serves static files. |
| `src/app/routes.ts` | `installRoutes` — mounts every enabled module's routes; runs before the 404 catch-all. |
| `src/app/error-handling.ts` | `installErrorHandling` — final middleware in the stack. |
| `src/app/workers.ts` | `registerWorkers` — called during `boot()` after the queue starts. |
| `src/infrastructure/adapters/cache.ts` | `startCache` — called during `boot()`. |
| `src/infrastructure/adapters/queue.ts` | `startQueue` — called during `boot()`. |
| `src/infrastructure/adapters/logger.ts` | `logger` — structured logging throughout the file. |
| `src/infrastructure/adapters/mailer.ts` | `registerTemplateDirectories` — called during `boot()` to register EJS template roots. |
| `src/infrastructure/adapters/template-registry.ts` | Consumed by `registerTemplateDirectories` to resolve template names at request/job time. |
| `scenarios/apply.ts` | Calls `createApp()` then `boot()` (never `start()`), driving real flows against its own loopback listener. |

## Notes

- **OTel import-ordering is fragile.** `startTracing()` sits between two `import` statements. This is only correct when this file is *dynamically* imported (i.e. `cluster.ts` is the entry). If a bundler or a static import chain pulls `express` before `startTracing()` executes, tracing silently misses those modules. The comment in the file calls this out explicitly.
- **`createApp` is synchronous; the returned lifecycle methods are not.** A test that only needs `.app` (supertest) never calls `boot`/`start`/`stop` and therefore triggers no infrastructure.
- **`start()` is idempotent, `stop()` is memoised.** Safe to call from a signal handler *and* a test's `afterAll` concurrently.
- **`env` overrides are process-wide.** The last `createApp` call wins. Read-at-import settings (e.g. a rate-limiter's budget) only see the override if it was installed before the first import of any module that reads it.
- **`NODE_HOST` unset = bind all interfaces.** The demo profile sets it to `127.0.0.1` because its tokens are signed with a hard-coded public secret; binding all interfaces in that profile would let any LAN host mint a token.
- **`startLocaleOverrideRefresh` is conditional.** It only starts the periodic timer when a locale-override provider is actually registered (`locales` module installed). Skipping it avoids a perpetual no-op poll.
- **`extension.install` is called before the 404 catch-all.** Mounting routes after `installRoutes` would be swallowed by the catch-all.
