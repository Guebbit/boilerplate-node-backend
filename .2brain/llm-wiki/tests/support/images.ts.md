---
source: tests/support/images.ts
sha256: 4274c1a8b033709a791f44c8fc13301b8b2154a13ed3cd7ac088870bcbe06dd7
generated_at: 2026-11-08T09:55:53.469119+00:00
model: ollama:qwen3.8:27b
---

# tests/support/images.ts

## Purpose

Provides image fixtures and the public-serving directory path for integration and contract test suites that exercise the real upload/digest pipeline. The fixtures are intentionally minimal (a 4×4 PNG) yet fully decodable, because the pipeline calls `sharp` to digest uploads inline.

## Key elements

- **`decodablePng(): Promise<Buffer>`** – Generates a valid 4×4 RGB PNG (background `#0a141e`) via `sharp` and returns it as a Buffer. Must be a real, decodable image rather than random bytes because the inline digest step will reject undecodable data.
- **`publicDirectory(): string`** – Resolves and returns `currentEnvironment().NODE_PUBLIC_PATH`, i.e. the directory the app serves uploaded files from. The value is set by `tests/support/setup-file-sandbox.ts` before any test file's top-level code executes.

## Relationships

- **`src/infrastructure/config/store.ts`** – Source of `currentEnvironment()`, consumed by `publicDirectory()` to read `NODE_PUBLIC_PATH`.
- **`tests/integration/image-acl.test.ts`**, **`tests/integration/product-multipart-write.test.ts`**, **`tests/integration/upload-claim.test.ts`**, **`tests/integration/upload-security.test.ts`** – Integration suites that call `decodablePng()` in `beforeAll` to produce upload payloads and use `publicDirectory()` to locate served files.
- **`src/modules/example/tests/contract/api.contract.test.ts`** – Contract suite that imports the same fixtures for its upload-related contract assertions.

## Notes

- The `!` on `NODE_PUBLIC_PATH` is a non-null assertion, not a guard: `setup-file-sandbox.ts` guarantees the value is assigned before any test file's module-level code runs, so the runtime value is always present.
- `decodablePng()` is a factory (returns a new Promise each call) rather than a cached constant; suites are expected to call it once in `beforeAll` and reuse the resulting Buffer.
- The image is 4×4 deliberately—the cost of encoding is negligible, and there is no benefit to a larger fixture for pipeline testing.
