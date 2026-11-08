---
source: src/infrastructure/runtime/config.ts
sha256: d9f52490a8282218528b97d362b69ccd50e70b4010d6fc565943f0a586c65101
generated_at: 2026-11-08T03:46:14.005772+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/runtime/config.ts

## Purpose

Declares the process-level runtime configuration — environment, logging, server binding, clustering, database connection, stock threshold, and tracing — using the project's typed config DSL. It also exports the two boolean predicates (`isTestEnvironment`, `isRelaxedEnvironment`) that gate safety behaviour across the app.

## Key elements

- **`LOG_LEVELS`** – Ordered tuple of the seven winston log-level strings; feeds `NODE_LOG_LEVEL`.
- **`PERSONAL_FIELD_MODES`** – `'hash' | 'redact' | 'plain'`; controls how PII renders in log lines (consumed by `adapters/logger.ts`).
- **`nodeEnvironmentConfig`** – Reads `NODE_ENV` with `verbatim: true` so a stray space is *not* normalised.
- **`loggingConfig`** – `NODE_SERVICE_NAME`, `NODE_LOG_LEVEL`, `NODE_LOG_PERSONAL_FIELDS`.
- **`serverConfig`** – `NODE_PORT` (default 3000), `NODE_HOST`, `NODE_GRACEFUL_SHUTDOWN_TIMEOUT_MS`.
- **`clusterConfig`** – Enable flag, worker count, crash-window / backoff / limit knobs, shutdown timeout.
- **`databaseConfig`** – `NODE_DB_URI`, `NODE_DB_PASSWORD` (marked `sensitive`), host/port/db-name, `NODE_MONGO_MAX_TIME_MS`.
- **`stockConfig`** – `NODE_LOW_STOCK_THRESHOLD` (default 5). Declared here to break the `inventory ⇄ products` circular dependency.
- **`tracingConfig`** – OTEL exporter endpoints and `NODE_TRUSTED_INGRESS` flag.
- **`nodeEnvironment()`** – Returns the raw `NODE_ENV` string or `undefined`.
- **`isTestEnvironment()`** – `true` when `NODE_ENV === 'test'`.
- **`isRelaxedEnvironment()`** – `true` only when `NODE_ENV` is exactly `'development'` or `'test'`; delegates to `isRelaxedIn`.

## Relationships

- **`src/infrastructure/config/define.ts`** – Imports `defineConfig` (shape builder) and `isRelaxedIn` (the environment-switch helper).
- **`src/infrastructure/config/fields.ts`** – Imports `text`, `int`, `flag`, `choice` field constructors.
- **`src/domain-primitives/time.ts`** – Imports `MINUTE_MS` as the default for `NODE_CLUSTER_CRASH_WINDOW_MS`.
- **`src/infrastructure/adapters/logger.ts`** – Reads `PERSONAL_FIELD_MODES` and the logging shape at runtime; sits on the same jest `globalSetup` import chain, which is why this file must use relative imports.

## Notes

- **Relative imports only.** This file is on jest's `globalSetup` chain (pulled in by `adapters/logger.ts`), where the `@infrastructure` path alias does not resolve. Do not switch to alias imports.
- **Fail-closed environment check.** `isRelaxedEnvironment` returns `false` for any value other than the two exact strings `'development'` / `'test'`. An unset, misspelt, or `staging` value gets production-strict behaviour.
- **`verbatim: true` on `NODE_ENV`.** A value like `' development'` (stray space) is intentionally *not* trimmed, so it falls through to strict mode.
- **`stockConfig` lives here, not in a domain module.** `inventory` depends on `products`; neither can import the other's config. Placing the shared threshold in this file avoids the cycle.
