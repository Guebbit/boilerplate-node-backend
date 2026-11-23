---
source: src/app.ts
source_sha256: 25bd06469c9cc37724055ade260fb75961b69bede79e2dc7ec5a72930ec06726
context_sha256: ee718421d1c3656c0e6f48dc9a79a94dcbe93efb6747f7d7501d04731f292715
generated_at: 2026-11-22T02:29:12.330768+00:00
model: claude-code:claude-sonnet-5-5
---

# src/app.ts

## Purpose
Exports `createApp()`, which builds one Express application: it loads the environment, starts OpenTelemetry, registers every enabled module, mounts the middleware stack and routes, and returns the app together with its `boot`/`start`/`stop` lifecycle. Importing the file does not serve traffic. Only calling `createApp()` has side effects, and the file's own comments say a separate `serve.ts` is the one place that calls `start()`.

## Key elements
- **`createApp(options?)`**: synchronous builder. It applies `options.env` through `installEnvironment`, creates the Express app, calls `registerModules(enabledModules, APP_CONFIG_SLICES)`, mounts the middleware and routes, and returns an `AppInstance`. It can be called many times, and each call is an independent instance.
- **`AppInstance`**: `{ app, boot, start, stop }`.
  - `app`: the mounted Express application, usable directly (e.g. by a supertest agent) with no boot.
  - `boot`: `bootProcess`. It brings up the database, cache, queue and workers, then i18n and validation messages, but does not open a socket.
  - `start`: runs `bootProcess()`, then the extension's `afterBoot`, then listens. It is idempotent while the server is already listening.
  - `stop`: graceful shutdown built by `createStop`. The in-flight promise is memoised, so concurrent callers share one shutdown.
- **`AppOptions`**: `env` (environment overrides laid over the process environment) and `extension`.
- **`AppExtension`**: optional `install(app)`, which mounts extra routes, and `afterBoot()`, which runs between boot and listening. Only the demo profile uses it.
- **Top-level side effects**: imports `./infrastructure/config/dotenv`, then calls `startTracing()`.

## Relationships
- **Setup order**: `infrastructure/config/dotenv` loads `.env` first. `infrastructure/config/store` provides `installEnvironment` and `EnvironmentOverrides`.
- **Startup**: `app/process-boot` supplies `bootProcess` and `createStop`. `app/config` supplies `APP_CONFIG_SLICES`.
- **Middleware and routes**:
  - `app/security` supplies `installSecurity`, `installRequestParsing` and `applyServerTimeouts`.
  - `app/request-context` supplies `requestIdMiddleware` and `installRequestContext`.
  - `app/static-assets` supplies `installStatic`.
  - `app/telemetry` supplies `installTelemetry`.
  - `app/routes` supplies `installRoutes`.
  - `app/error-handling` supplies `installErrorHandling`.
  - `infrastructure/http/middlewares/connection-close` supplies `closeWhileDraining`.
  - `infrastructure/http/middlewares/locale` supplies `attachLocale`.
- **Logging**: it logs through `infrastructure/adapters/logger`. It also uses `@infrastructure/runtime/*` (`otel-sdk`, `config`, `server-lifecycle`, `readiness`), `@kernel/registry` and `@kernel/translation`.
- **`scenarios/apply.ts`**: calls `boot()` but never `start()`, and drives flows against its own loopback listener. It also calls `installEnvironment` itself before the first import of this file, so that read-at-import settings see the overrides.

## Notes
- **Middleware order is the behaviour.** The order is:
  1. `closeWhileDraining`
  2. `requestIdMiddleware`
  3. `installSecurity`
  4. `installStatic`
  5. `attachLocale`
  6. `installRequestParsing`
  7. `installRequestContext`
  8. `installTelemetry`
  9. the extension's `install`
  10. `installRoutes`
  11. `installErrorHandling`
  
  The in-file comments give these reasons:
  - **`closeWhileDraining`** is first so that every later refusal tells a draining client to reconnect.
  - **Request id before security** means the rate limiter's 429 still carries the request id.
  - **Security** comes early because `trust proxy` defines `request.ip`, which the limiter keys on.
  - **Static before the limiter** means asset requests do not spend the caller's request budget.
  - **Locale before parsing** lets the limiter's 429 and parser errors (400/413/415) answer in the caller's language.
  - **The extension's `install`** must come before `installRoutes`, because the 404 catch-all would otherwise swallow its routes.
  - **Error handling** is last because an Express error handler only catches what was mounted before it.
- **OTel ordering:** when this file is imported statically, the imports are hoisted above `startTracing()`, so the call there is only a safety net. The file's comments say the main entry point starts tracing itself and imports this file dynamically, which is what guarantees the order.
- **Environment overrides are process-wide.** The last app built wins.
- **Binding:** `NODE_HOST` unset means listening on all interfaces. The demo profile sets loopback because its tokens are signed with a public secret.
- **Readiness:** `markServerListening()` runs after `listen`, and `GET /readyz` answers 200 only from that point.
- **Translation:** if no translation provider is available, the app logs "content is monolingual". This is a supported deployment shape.
