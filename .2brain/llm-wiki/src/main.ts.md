---
source: src/main.ts
sha256: 3f8466738a2239521e27efb348c45ed16581e2dfb957b6e1cf9078afbff71252
generated_at: 2026-11-14T18:24:44.321822+00:00
model: ollama:qwen3.8:27b
---

# src/main.ts

## Purpose

The default single-process entry point for the application. It orchestrates the exact bootstrap sequence—loading environment variables, setting Mongoose defaults, starting OpenTelemetry tracing—then dynamically imports the HTTP server so that tracing patches are in place before Express or Mongoose are loaded. It is the target of `npm start`, `npm run dev`, `e2e:serve`, `debug`, `dev:docker`, and the production image CMD.

## Key elements

- **`import './infrastructure/config/dotenv'`** — Side-effect import; loads `.env` into the process environment before any other module reads configuration.
- **`import '@infrastructure/runtime/mongoose-boot'`** — Side-effect import; sets Mongoose connection/query defaults before any schema is built.
- **`startTracing()` (from `@infrastructure/runtime/otel-sdk`)** — Initialises the OTel SDK. Must run before Express/HTTP/Mongoose are loaded because it monkey-patches them.
- **`logger` (from `@infrastructure/adapters/logger`)** — Used solely in the error path to log a failed server load.
- **`import('./serve').catch(…)`** — Dynamic import that builds, listens, and wires signal handlers for the HTTP server. On failure, logs the error and sets `process.exitCode = 1`.

## Relationships

- **`src/infrastructure/config/dotenv.ts`** — Imported first (side-effect only); responsible for loading the `.env` file into the process environment before any subsequent module reads configuration.
- **`src/infrastructure/runtime/mongoose-boot.ts`** — Imported second (side-effect only); sets Mongoose options that take effect at schema-definition time.
- **`src/infrastructure/runtime/otel-sdk.ts`** — Source of `startTracing()`, the only function called from this file; must execute before the dynamic `./serve` import resolves.
- **`src/infrastructure/adapters/logger.ts`** — Provides the `logger` instance used in the `.catch` handler for a failed `./serve` import.

## Notes

- **Import order is load-bearing.** A static `import './serve'` would be hoisted above `startTracing()`, breaking OTel's instrumentation. The dynamic `import()` is intentional and must not be refactored to a static import.
- **`process.exitCode` is set (not `process.exit`)** so that any in-flight async work can flush before the process actually exits.
- A separate cluster-mode entry point exists at `src/cluster.ts` (`npm run start:cluster`); do not conflate the two.
- `extractErrorMessage` from `@guebbit/js-toolkit` normalises non-`Error` rejections before logging.
