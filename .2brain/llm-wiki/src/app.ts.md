---
source: src/app.ts
sha256: e683df7038b5fe66a37cae2da47ad254561ae25aa10f5eead91463c4f8a88b37
generated_at: 2026-09-27T14:02:09.698105+00:00
model: ollama:qwen3.8:27b
---

# src/app.ts

## Purpose

Composition root for the Express application. `createApp()` synchronously builds the `app` object, mounts the middleware stack and all enabled modules, and returns an `AppInstance` with a separated `boot` / `start` / `stop` lifecycle. It is the single place where infrastructure adapters, i18n, validation messages, and every domain module are wired together — importing it has no side effects; calling it does.

## Key elements

- **`createApp(): AppInstance`** — the sole export. Builds the Express app, registers modules (`registerModules`), installs the full middleware stack in fixed order, and closes over per-instance `activeServer` / `shutdownPromise` state.
- **`AppInstance`** — interface returned by `createApp`: `app` (the Express instance, usable directly by supertest), `boot()` (infra only: DB → cache → queue → workers → i18n → locale overrides → validation messages), `start()` (boot + optional demo restore + `listenOn`), `stop()` (graceful shutdown, memoised).
- **`startTracing()`** — called at the very top of the module, before any Express/Mongoose import, to satisfy the OTel initialisation ordering constraint.
- **`DEFAULT_PORT = 3000`** — fallback when `NODE_PORT` is unset.
- **Middleware install sequence** — `installSecurity` → `installStatic` → `installRequestParsing` → `installRequestContext` → `installTelemetry` → `installDemo` (demo mode only) → `installRoutes` → `installErrorHandling`. Order is behavioural, not cosmetic.

## Relationships

- **`src/app/security.ts`** — supplies `installSecurity`, `installRequestParsing`, `applyServerTimeouts`; first in the middleware chain because `trust proxy` and rate-limit bucketing depend on it.
- **`src/app/static-assets.ts`** — supplies `installStatic`; mounted before rate limiting so asset requests don't consume the caller's budget.
- **`src/app/request-context.ts`** — supplies `installRequestContext`; attaches request-id, observability handle, and negotiated locale that controllers read.
- **`src/app/telemetry.ts`** — supplies `installTelemetry`; wraps the handler so its timer measures the full route.
- **`src/app/routes.ts`** — supplies `installRoutes`; mounted before error handling so its 404 catch-all still catches unhandled paths.
- **`src/app/error-handling.ts`** — supplies `installErrorHandling`; last in the chain (Express error middleware only catches what precedes it).
- **`src/app/demo.ts`** — supplies `installDemo` and `restoreScenario`; active only when `isDemoMode()` is true.
- **`src/app/workers.ts`** — supplies `registerWorkers`; called during `boot()`.
- **`src/app/required-config.ts`** — supplies `APP_NON_MODULE_CHECKS` passed to `registerModules`.
- **`src/infrastructure/adapters/cache.ts`** — supplies `startCache`, called during `boot()`.
- **`src/infrastructure/adapters/queue.ts`** — supplies `startQueue`, called during `boot()`.
- **`src/infrastructure/adapters/logger.ts`** — supplies the `logger` used for lifecycle log lines.
- **`src/infrastructure/i18n/boot.ts`** — supplies `bootI18n`, `isLocaleOverrideAvailable`, `refreshLocaleOverrides`, `startLocaleOverrideRefresh`; called during `boot()` after the queue so i18n dictionaries are in place before `registerValidationMessages`.
- **`src/infrastructure/http/validation-messages.ts`** — supplies `registerValidationMessages`; must run after i18n boot because it resolves copy through `t`.
- **`scenarios/apply.ts`** — calls `createApp().boot()` (never `start()`) to drive real flows against its own loopback listener without binding `NODE_PORT`.

## Notes

- **OTel import ordering is fragile.** `startTracing()` sits above the `express` / `mongoose` imports. This only works when `cluster.ts` is the process entry and imports this file *dynamically* after `startTracing` has already run. If this file is statically imported at the top of an entry script, the hoisted `express` import will execute before `startTracing()` and tracing will be incomplete.
- **`start()` is idempotent.** A second call while `activeServer.listening` is true resolves with the existing `Server` rather than binding again.
- **`stop()` is memoised.** Concurrent callers (e.g. a signal handler and a test's `afterAll`) share one shutdown promise; `activeServer` and `shutdownPromise` are reset in `.finally`.
- **`boot()` is deliberately separate from `start()`.** This exists so `scenarios/apply.ts` can start infrastructure without binding a port on a container.
- **Locale overrides are awaited for ordering, not correctness.** `refreshLocaleOverrides` never rejects, but a request landing between `bootI18n` and the first refresh would see un-overridden copy. The initial refresh is therefore awaited at boot; the periodic refresh is fire-and-forget.
- **`NODE_HOST` unset → bind all interfaces.** The demo profile sets it to loopback because its tokens use a hard-coded public secret; the production shape wants `0.0.0.0`.
- **`createApp` is callable more than once.** Each call returns an independent instance with its own closure state, which is the seam SK-D4 will use to inject configuration.
- **Middleware order is the contract.** The block comment above the install calls documents five load-bearing ordering constraints. Reordering any line changes observable behaviour (trust-proxy scope, rate-limit keying, locale availability, timer boundaries, 404 catch-all coverage).
