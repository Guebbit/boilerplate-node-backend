---
source: src/app.ts
sha256: fd75a847e025ca50c2661f8fcc177270c9654d81e25cd694da9b12b0a0082d44
generated_at: 2026-10-14T07:37:06.461569+00:00
model: ollama:qwen3.8:27b
---

# src/app.ts

## Purpose

Builds a single Express application instance — wiring infrastructure (OTel, cache, queue, i18n), mounting every enabled module's routes and middleware, and returning a `boot`/`start`/`stop` lifecycle. It deliberately separates *building* the app (synchronous, import-safe) from *serving* traffic (only `src/serve.ts` calls `start()` and binds a socket).

## Key elements

- **`createApp(options?)`** — Synchronous factory. Validates module config, registers domain-event handlers, mounts the full middleware stack and all routes. Returns an `AppInstance`. Callable more than once; each call is an independent closure.
- **`AppInstance`** — `{ app, boot, start, stop }`. `app` is the bare Express instance (usable as a supertest target with no boot). `boot` starts DB → cache → queue → workers → i18n → validation messages. `start` = `boot` + optional `afterBoot` + `listenOn`. `stop` = graceful shutdown (memoized).
- **`AppOptions`** — `{ env?, extension? }`. `env` overrides process environment variables (process-wide; last call wins). `extension` is an optional `AppExtension`.
- **`AppExtension`** — `{ install?(app), afterBoot?() }`. Mounts extra routes before the 404 catch-all; runs a post-boot, pre-listen step. Only the demo profile uses it.
- **`startTracing()`** — Called at module top-level, *before* `express` is imported, to satisfy OTel's instrumentation ordering requirement.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/app/config.ts` | Imports `APP_CONFIG_SLICES` for module config validation. |
| `src/app/security.ts` | Calls `applyServerTimeouts`, `installRequestParsing`, `installSecurity` during build. |
| `src/app/request-context.ts` | Calls `installRequestContext`, `requestIdMiddleware` during build. |
| `src/app/telemetry.ts` | Calls `installTelemetry` during build. |
| `src/app/static-assets.ts` | Calls `installStatic` during build. |
| `src/app/routes.ts` | Calls `installRoutes` (last middleware mounted, before 404). |
| `src/app/error-handling.ts` | Calls `installErrorHandling` (final error middleware). |
| `src/app/workers.ts` | Calls `registerWorkers` inside `boot()`. |
| `src/infrastructure/adapters/cache.ts` | Calls `startCache` inside `boot()`. |
| `src/infrastructure/adapters/queue.ts` | Calls `startQueue` inside `boot()`. |
| `src/infrastructure/adapters/mailer.ts` | Calls `registerTemplateDirectories` inside `boot()`. |
| `src/infrastructure/adapters/logger.ts` | Imports `logger` for startup/shutdown log lines. |
| `scenarios/apply.ts` | Calls `createApp` → `boot()` but never `start()`; drives flows on its own loopback listener. |
| `package.json` | Provides the module path aliases (`@app`, `@infrastructure`, `@kernel`) and script entry points. |

## Notes

- **OTel import-order constraint is the file's raison d'être.** `startTracing()` runs before `express` is imported. This only holds when `cluster.ts` dynamically imports this module; a static top-level import of `express` in the entry would hoist past the tracing call.
- **`createApp()` is the side effect, not importing the file.** Importing the module triggers OTel init; calling `createApp()` triggers all middleware/route registration. Tests import the module for OTel but call `createApp` only when they need the built app.
- **`env` overrides are process-wide.** Because config slices read at import time, the last `createApp` call with `env` wins for the whole process. Read-at-import settings (e.g. rate-limiter budgets) only see an override if `installEnvironment` ran before the first import of the module that reads them.
- **`start()` is idempotent.** A second call while listening resolves the existing `Server` rather than binding again.
- **`stop()` is race-safe.** The shutdown promise is memoized, so a signal handler and a test's `afterAll` sharing one instance share a single shutdown.
- **`boot()` vs `start()` split exists for one caller.** `scenarios/apply.ts` needs infrastructure but must not bind `NODE_PORT`; it calls `boot()` on its own loopback listener.
- **Locale-override refresh is awaited at boot for ordering, not correctness.** An empty overlay is a valid state, but a request served between `init` and the first refresh would see un-overridden copy.
