---
source: tests/unit/app/main.test.ts
sha256: af3889681d0bdc9ceee111ecb23722d1793f29cf0157232d35a75ec3d0aa7901
generated_at: 2026-11-15T00:24:27.849851+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/app/main.test.ts

## Purpose

Verifies the **load order** of `src/main.ts`'s collaborators: environment bootstrap, infrastructure boot, tracing startup, and finally the HTTP/Mongo layer. This matters because `serve` pulls in Express and Mongoose, which OpenTelemetry must have already patched—so `startTracing()` must run before `serve` is imported. The test does not exercise any application behavior; it only asserts sequencing.

## Key elements

- **`order: string[]`** — Shared array that each mock appends to, recording the moment a collaborator is touched.
- **`jest.mock` factories** — Replace four real modules with recording stubs:
  - `@infrastructure/runtime/otel-sdk` — records `'tracing'` when `startTracing` is *called*.
  - `@infrastructure/runtime/mongoose-boot` — records `'mongoose-boot'` at *module-load* time.
  - `../../../src/infrastructure/config/dotenv` — records `'dotenv'` at *module-load* time.
  - `../../../src/serve` — records `'serve'` at *module-load* time.
- **`it('loads the environment, starts tracing, then serves')`** — Dynamically imports `../../../src/main`, flushes microtasks with `setImmediate`, then asserts `order` equals `['dotenv', 'mongoose-boot', 'tracing', 'serve']`.

## Relationships

No graph neighbors are registered for this file.

## Notes

- The expected order places **`mongoose-boot` before `tracing`**, even though the file's doc-comment summarizes the entry as "environment → tracing → serve." The `mongoose-boot` module is a static import that executes before `startTracing()` is invoked; the test codifies that nuance.
- `serve` is loaded via a **dynamic `import()`** inside the entry under test, so the test must `await setImmediate` to let that promise resolve before asserting. Forgetting this tick makes the test flaky or fail.
- Two of the mocks record at *factory-execution* (module import) time and two record at *call* time. If the entry under test ever switches between static and dynamic import of a collaborator, the recorded position in `order` will shift and the assertion will catch it.
