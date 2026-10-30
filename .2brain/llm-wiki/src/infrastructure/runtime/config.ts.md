---
source: src/infrastructure/runtime/config.ts
sha256: 625d61aef6ceec0927e53a841e116020ca19d6b5ec61794cadf29e2f629cd6ea
generated_at: 2026-10-29T02:14:38.088630+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/runtime/config.ts

## Purpose

Central declaration of every environment-driven setting this process reads: runtime environment, logging, HTTP server, clustering, database, stock threshold, and tracing. Each group is a `defineConfig` object that validates and defaults its fields at read time. The file also exposes the three boolean predicates (`nodeEnvironment`, `isTestEnvironment`, `isRelaxedEnvironment`) that gate safety behaviours across the codebase.

## Key elements

- **`nodeEnvironmentConfig`** – validates `NODE_ENV` (verbatim text; no trimming).
- **`loggingConfig`** – `NODE_SERVICE_NAME`, `NODE_LOG_LEVEL` (constrained to `LOG_LEVELS`), `NODE_LOG_PERSONAL_FIELDS` (constrained to `PERSONAL_FIELD_MODES`).
- **`serverConfig`** – `NODE_PORT`, `NODE_HOST`, `NODE_GRACEFUL_SHUTDOWN_TIMEOUT_MS`.
- **`clusterConfig`** – worker count, crash window/back-off, shutdown timeout, crash limit.
- **`databaseConfig`** – MongoDB URI, host/port/name, max-time; `NODE_DB_PASSWORD` is marked `sensitive`.
- **`stockConfig`** – `NODE_LOW_STOCK_THRESHOLD`; declared here so both `inventory` and `products` read the same value without circular imports.
- **`tracingConfig`** – OTLP endpoint fields and `NODE_TRUSTED_INGRESS` flag.
- **`PERSONAL_FIELD_MODES`** – `['hash', 'redact', 'plain']`; consumed by `adapters/logger.ts` to format a field in log lines.
- **`nodeEnvironment()`** – returns the raw `NODE_ENV` string or `undefined`.
- **`isTestEnvironment()`** – `true` only when `NODE_ENV === 'test'`; gates socket/signal-handler installation in test suites.
- **`isRelaxedEnvironment()`** – `true` only for exactly `development` or `test`. Single definition of "not a deployment"; keys off `isRelaxedIn` from `../config/define`.

## Relationships

- **`src/infrastructure/config/define.ts`** – source of `defineConfig` and `isRelaxedIn` used throughout this file.
- **`src/infrastructure/config/fields.ts`** – source of the `choice`, `flag`, `int`, `text` field constructors.
- **`src/infrastructure/adapters/logger.ts`** – reads `PERSONAL_FIELD_MODES` and `loggingConfig`; must use a relative import because it sits on jest's `globalSetup` chain where path aliases are unavailable.
- **Graph neighbors** (`src/app.ts`, `src/cluster.ts`, `src/infrastructure/runtime/database.ts`, `src/infrastructure/runtime/otel-sdk.ts`, `src/app/config.ts`, `src/app/error-handling.ts`, `src/app/request-context.ts`, `scenarios/apply.ts`, middleware files, `src/infrastructure/observability/tracer.ts`) – consume the exported config objects and predicates to obtain validated values at runtime.

## Notes

- All imports are **relative** by design; the `@infrastructure` alias is deliberately avoided so `adapters/logger.ts` (on the jest `globalSetup` import path) can resolve this file.
- `NODE_ENV` is validated as `verbatim` text—whitespace is not trimmed. A typo like `" development"` is intentionally treated as a distinct (strict) value.
- `isRelaxedEnvironment` is the **only** place that decides "is this a safe-to-be-loose environment." Every other gate (secure cookies, seeder refusal, stack-trace suppression, production-only secrets) should call this rather than re-checking `NODE_ENV` itself.
- `stockConfig` lives here (infrastructure) rather than in a domain module to break the circular dependency between `inventory` and `products`.
