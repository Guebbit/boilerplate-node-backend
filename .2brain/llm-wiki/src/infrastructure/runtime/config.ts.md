---
source: src/infrastructure/runtime/config.ts
sha256: e9a44691ec7b4dc06b481fe137dfaac31c69d5f3f4ccd7646fa95bb97b11b0ca
generated_at: 2026-10-14T08:12:58.566849+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/runtime/config.ts

## Purpose

Declares every environment-variable the process reads, grouped into named config bundles (environment, logging, server, cluster, database, currency, stock, tracing). It is the single source of truth for "what kind of process am I?" and exposes the `isRelaxedEnvironment` guard that every safety mechanism keys off. It lives in `runtime/` rather than in individual modules so that cross-module shared values (currency, stock threshold) have one canonical declaration.

## Key elements

- **`nodeEnvironmentConfig`** – `NODE_ENV` (text, `verbatim: true` so stray whitespace is rejected).
- **`loggingConfig`** – service name, log level (`LOG_LEVELS`), and personal-field mode (`PERSONAL_FIELD_MODES`: `hash` | `redact` | `plain`).
- **`serverConfig`** – port, host, graceful-shutdown timeout.
- **`clusterConfig`** – enable flag, worker count, crash-window/backoff/shutdown-tuning knobs.
- **`databaseConfig`** – MongoDB URI, password (marked `sensitive`), host/port/name, max-time.
- **`currencyConfig`** – `NODE_DEFAULT_CURRENCY` (default `'EUR'`). Shared by `orders` and `products` to avoid a module import cycle.
- **`stockConfig`** – `NODE_LOW_STOCK_THRESHOLD` (default `5`). Shared by `inventory` and `products` for the same cycle-avoidance reason.
- **`tracingConfig`** – OTLP endpoints, `NODE_TRUSTED_INGRESS` flag, `npm_package_version`.
- **`nodeEnvironment()`** – returns the raw `NODE_ENV` string or `undefined`.
- **`isTestEnvironment()`** – `true` when `NODE_ENV === 'test'`; the gate that prevents suites from opening sockets or installing signal handlers.
- **`isRelaxedEnvironment()`** – the single definition of "not a deployment". Returns `true` only for `development` or `test`. Delegates to `isRelaxedIn` from `define.ts`. Fail-closed: any other value (unset, `staging`, a typo) yields strict behaviour.
- **`PERSONAL_FIELD_MODES`** – exported const tuple consumed by `adapters/logger.ts`.

## Relationships

- **`src/infrastructure/config/define.ts`** – provides `defineConfig` and `isRelaxedIn`; the building blocks every config object in this file uses.
- **`src/infrastructure/config/fields.ts`** – provides `text`, `int`, `flag`, `choice` field descriptors.
- **`src/infrastructure/adapters/logger.ts`** – imports `loggingConfig` and `PERSONAL_FIELD_MODES` to configure winston output.
- **`src/infrastructure/runtime/database.ts`** – reads `databaseConfig` to connect MongoDB.
- **`src/infrastructure/runtime/otel-sdk.ts`** – reads `tracingConfig` to initialise the OTel SDK.
- **`src/cluster.ts`** – reads `clusterConfig` to decide whether to fork workers and to tune crash-restart behaviour.
- **`src/app.ts`** – entry point; reads `serverConfig` for port/host and `isRelaxedEnvironment` for boot-time safety checks.
- **`src/app/error-handling.ts`** – calls `isRelaxedEnvironment()` to decide whether to expose stack traces in error responses.
- **`src/app/config.ts`** – app-level config layer that sits on top of / alongside these runtime configs.
- **`scenarios/apply.ts`** – scenario/seed entry; consults `isTestEnvironment()` and `isRelaxedEnvironment()` before performing side-effects.

## Notes

- **Relative imports only.** The file deliberately avoids the `@infrastructure` path alias because `adapters/logger.ts` sits on jest's `globalSetup` import chain, where that alias is not resolvable. Adding an aliased import here would break test runs.
- **Fail-closed `NODE_ENV`.** `isRelaxedEnvironment` is the one switch for "is this a developer/CI machine vs. a real server?" Any value other than exactly `development` or `test` (including `undefined`, `staging`, or a typo with a trailing space — caught by `verbatim: true`) falls to the strict path. Do not add new "relaxed" values here; add a new guard instead.
- **Cycle-avoidance placement.** `currencyConfig` and `stockConfig` live here (infrastructure) rather than in `orders`/`products`/`inventory` because the module dependency graph makes a cross-import impossible without creating a cycle.
- **`npm_package_version`** in `tracingConfig` is read as an env-var-style field (set by the npm toolchain at `npm run` time) rather than imported from `package.json` directly, keeping the file's dependency surface uniform.
