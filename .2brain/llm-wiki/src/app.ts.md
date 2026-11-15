---
source: src/app.ts
sha256: 426107c2e8a493a477a4543a9a9999beef10d9e88f5504d34bd6f49046c70b81
generated_at: 2026-11-14T17:47:35.859822+00:00
model: ollama:qwen3.8:27b
---

# src/app.ts

## Purpose

Assembly point for the Express application. `createApp()` validates module config, registers enabled modules, mounts the middleware stack and routes in a fixed order, and returns a `{ app, boot, start, stop }` lifecycle object. It is the single place where infrastructure, modules, and the HTTP surface are wired together; calling it has side effects, importing it does not.

## Key elements

- **`createApp(options?: AppOptions): AppInstance`** — Synchronously builds the Express app (module registration, middleware, routes) and returns the lifecycle handle. Callable more than once; each call is an independent instance with its own server/shutdown closure.
- **`AppInstance`** — `{ app, boot, start, stop }`. `boot` starts DB → cache → queue → workers → rendering → locale override → validation messages. `start` calls `boot`, runs any `afterBoot` extension step, then listens. `stop` performs graceful shutdown, settling in-flight outbox nudges first.
- **`AppOptions`** — `{ env?: EnvironmentOverrides, extension?: AppExtension }`. `env` is applied via `installEnvironment` before any config read; `extension` provides optional extra routes and a post-boot hook (used only by the demo profile).
- **`AppExtension`** — `{ install?(app), afterBoot?() }`. `install` runs before the 404 catch-all; `afterBoot` runs between `boot` and `listen`.
- **Middleware stack (in registration order)** — request-id → security → static → locale → request parsing → telemetry → routes → error handling. The order is load-bearing; see the in-file comment for the seven ordering constraints.
- **`startTracing()`** — Called at module top-level before `express` is imported; the only ordering constraint the file exists to preserve.

## Relationships

- **`src/infrastructure/config/dotenv.ts`** — Imported first (side-effect import); ensures `.env` is loaded before the config store reads the environment.
- **`src/app/config.ts`** — Exports `APP_CONFIG_SLICES`, passed to `registerModules` for per-module config validation.
- **`src/app/workers.ts`** — `registerWorkers()` is called during `boot`.
- **`src/app/boot-rendering.ts`** — `bootRendering()` is called during `boot` (files → templates → admin edits).
- **`src/app/security.ts`** — Provides `installSecurity`, `installRequestParsing`, and `applyServerTimeouts` (applied after `listen`).
- **`src/app/request-context.ts`** — Provides `installRequestContext` and `requestIdMiddleware`; runs before security so refused requests remain correlatable.
- **`src/app/telemetry.ts`** — Provides `installTelemetry`, mounted after request parsing.
- **`src/app/static-assets.ts`** — Provides `installStatic`; mounted before the rate limiter so static files don't consume request budget.
- **`src/app/routes.ts`** — Provides `installRoutes`; mounted after all other middleware, before the error handler.
- **`src/app/error-handling.ts`** — Provides `installErrorHandling`; final middleware in the chain.
- **`src/infrastructure/adapters/cache.ts`** — `startCache()` called during `boot`.
- **`src/infrastructure/adapters/queue.ts`** — `startQueue()` called during `boot`.
- **`src/infrastructure/adapters/logger.ts`** — `logger` used for startup/shutdown log lines.
- **`scenarios/apply.ts`** — Calls `createApp()` then `boot()` only (drives real flows against its own loopback listener; never calls `start()`).

## Notes

- **OTel import ordering:** `startTracing()` must run before `express`, `http`, or `mongoose` are first imported. This only holds when the entry point (`cluster.ts`) imports this file *dynamically*; if this file were itself the static entry, the hoisted imports would run first and tracing would be silent.
- **Idempotency:** Both `start()` and `stop()` are safe to call repeatedly. `start` checks `activeServer?.listening`; `stop` memoises its promise so concurrent callers (signal handler + test `afterAll`) share one shutdown.
- **`env` is process-wide:** Because config slices are process-global, the last `createApp` call with an `env` option wins for all subsequent reads.
- **This file does not listen.** `src/serve.ts` is the sole caller of `start()` in production; it wires the returned `Server` to process signals.
- **Monolingual is valid:** If no translation provider is registered, the app logs an info line and continues; this is a supported deployment shape, not an error.
