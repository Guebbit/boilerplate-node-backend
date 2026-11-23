---
source: src/main.ts
source_sha256: f2fc9c18b81beeb258e753b50b39e5612b96c666690aad1ed9d4488280108d5b
context_sha256: 9715015c743338bc66498ee3f3f99b6c2cb7ab20217930c03fb5b78516f41cd0
generated_at: 2026-11-22T03:15:09.961631+00:00
model: claude-code:claude-sonnet-5-5
---

# src/main.ts

## Purpose
The default process entry point: one process runs one app. It is what `npm start`, `npm run dev`, `e2e:serve`, `debug`, `dev:docker` and the production image's CMD run. Its main job is to enforce a strict startup order so that OpenTelemetry can patch express, http and the models before they load.

## Key elements
- **Side-effect imports (in order):** `dotenv` loads `.env` into the environment. `mongoose-boot` sets Mongoose defaults, which are read at schema build.
- **`startTracing()`** (from `otel-sdk`): starts the OpenTelemetry SDK before `serve` is loaded.
- **`loadDevelopmentDoubles()`**: registers the development doubles. It is a no-op outside `NODE_ENV=development`.
- **Dynamic `import('./serve')`**: builds the app, listens, and wires the signal handlers. It is dynamic because a static import would be hoisted above `startTracing()`. Nothing uses the instance it returns.
- **Error handler:** if loading the doubles or `serve` fails, it logs `Could not load the server.` through `logger.error` (with the message from `extractErrorMessage`) and sets `process.exitCode = 1`.

## Relationships
- `src/infrastructure/config/dotenv.ts`: imported first, because every other import reads the environment.
- `src/infrastructure/runtime/mongoose-boot.ts`: imported before any model loads.
- `src/infrastructure/runtime/otel-sdk.ts`: provides `startTracing`, called before `serve` is imported.
- `src/app/development-doubles.ts`: provides `loadDevelopmentDoubles`, which runs after tracing and before `serve`. The doubles are therefore registered before the config gate and any request.
- `src/infrastructure/adapters/logger.ts`: provides `logger`, used only for the startup failure message.
- `./serve`: loaded dynamically and not listed among the graph neighbors.

## Notes
- Don't convert the `serve` import to a static import or reorder the imports. Either change breaks OTel instrumentation, and the `.env` and Mongoose defaults ordering.
- To scale, run more copies of this entry. Do not fork inside it.
- A startup failure sets the exit code rather than calling `process.exit`.
