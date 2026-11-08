---
source: src/app.ts
sha256: 8fef2030bb934f4ad03a5c3a5d2309280cf9ad4f8a46d254f89b1d65329d5928
generated_at: 2026-11-08T03:12:21.330903+00:00
model: ollama:qwen3.8:27b
---

# src/app.ts

## Purpose

Application factory. `createApp()` synchronously builds one Express instance — validates module config, registers domain-event handlers, mounts the middleware stack and every enabled route — and returns a `{ app, boot, start, stop }` lifecycle object. The file's sole structural purpose is preserving import order: OpenTelemetry must initialize before `express`, `http`, or `mongoose` are loaded, which only holds when a dynamic-import entry (e.g. `cluster.ts`) loads this module.

## Key elements

- **`startTracing()`** — called at module top-level, before `express`/`mongoose` imports resolve. Must be the earliest side-effectful line.
- **`createApp(options?: AppOptions): AppInstance`** — the exported factory. Reads `AppOptions.env` (process-wide override), builds the Express app, wires middleware, and closes over `activeServer` / `shutdownPromise` for the instance's lifecycle.
- **`AppInstance`** — `{ app: Express; boot(); start(): Promise<Server>; stop() }`. `boot` connects infra (DB → cache → queue → workers → i18n → templates → validation messages) without binding a port. `start` = `boot` + optional `extension.afterBoot` + `listenOn` + `applyServerTimeouts` + `markServerListening`. `stop` is a memoised graceful shutdown.
- **`AppOptions`** — `{ env?: EnvironmentOverrides; extension?: AppExtension }`. `env` is applied via `installEnvironment` before any config read; process-wide, last call wins.
- **`AppExtension`** — `{ install?(app); afterBoot?() }`. Demo-profile only; production never passes one. `install` mounts extra routes before the 404 catch-all; `afterBoot` runs between `boot` and `listen`.
- **Boot chain (inside `createApp`)** — `startDatabase → startCache → startQueue → registerWorkers → bootI18n → registerTemplateDirectories → refreshLocaleOverrides → startLocaleOverrideRefresh → registerValidationMessages`. Ordering is load-bearing: validation messages resolve copy through the i18n translator, so they must register last.

## Relationships

- **`src/app/config.ts`** — imports `APP_CONFIG_SLICES`, the per-module config fragments validated at build time.
- **`src/app/security.ts`** — imports `installSecurity`, `installRequestParsing`, `applyServerTimeouts` (timeouts applied to the `Server` socket at listen time).
- **`src/app/request-context.ts`** — imports `installRequestContext`, `requestIdMiddleware`.
- **`src/app/telemetry.ts`** — imports `installTelemetry`.
- **`src/app/routes.ts`** — imports `installRoutes` (mounted after static, before error-handling).
- **`src/app/static-assets.ts`** — imports `installStatic`.
- **`src/app/error-handling.ts`** — imports `installErrorHandling` (final middleware in the stack).
- **`src/app/workers.ts`** — imports `registerWorkers`, called during `boot()` after the queue starts.
- **`src/infrastructure/adapters/cache.ts`** — imports `startCache` (boot chain, step 3).
- **`src/infrastructure/adapters/queue.ts`** — imports `startQueue` (boot chain, step 4).
- **`src/infrastructure/adapters/mailer.ts`** — imports `registerTemplateDirectories` (boot chain, step 6).
- **`src/infrastructure/adapters/logger.ts`** — imports `logger` for the start/stop log lines.
- **`scenarios/apply.ts`** — calls `createApp` and invokes `boot()` (never `start()`) to drive real flows against its own loopback listener without binding `NODE_PORT`.

## Notes

- **Import-order contract.** `startTracing()` sits between the `dotenv` import and the `express` import. If this file is ever statically imported by the process entry (rather than dynamically imported by `cluster.ts`), the ESM/TS hoisting of `express`/`mongoose` will place them *above* the `startTracing()` call and tracing will silently miss them. The module docblock flags this as the one ordering invariant the file exists to preserve.
- **`env` is process-wide.** Because config slices are process-level singletons, calling `createApp` twice with different `env` values means the *last* call wins. Read-at-import settings (e.g. a rate-limiter's budget) only see an override if it was installed before the first `import` of this file.
- **`start()` is idempotent, `stop()` is memoised.** A second `start()` while already listening resolves immediately; concurrent `stop()` calls share one `shutdownPromise`. This lets a signal handler and a test's `afterAll` race safely.
- **`refreshLocaleOverrides` is awaited for ordering, not correctness.** It never rejects; the await prevents a request between init and first refresh from seeing un-overridden copy.
- **`NODE_HOST` default is "bind all interfaces."** The demo profile (`scenarios/run-server.ts`) sets it to loopback because its tokens are signed with a hard-coded public secret — binding 0.0.0.0 would let any LAN host mint one.
- **`extension.install` runs before the 404 catch-all.** Mounting extra routes after `installRoutes` would be silently swallowed.
