---
source: tests/support/images.ts
sha256: 4274c1a8b033709a791f44c8fc13301b8b2154a13ed3cd7ac088870bcbe06dd7
generated_at: 2026-10-29T07:08:43.587506+00:00
model: ollama:qwen3.8:27b
---

# tests/support/images.ts

## Purpose

Provides small, deterministic image fixtures (a decodable PNG buffer and the public storage directory path) for integration and contract test suites that exercise the real upload pipeline.

## Key elements

- **`decodablePng(): Promise<Buffer>`** — Generates a 4×4 RGB PNG in-memory via `sharp`. Intended to be called inside `beforeAll`; the file is small enough that caching adds no value. The image must be genuinely decodable because, without a message broker, uploads are digested inline and a random-byte buffer would be rejected.
- **`publicDirectory(): string`** — Returns `path.resolve(currentEnvironment().NODE_PUBLIC_PATH!)`. The non-null assertion is safe at runtime because `tests/support/setup-file-sandbox.ts` assigns the value before any test file's top-level code executes; the `!` only satisfies the type checker.

## Relationships

- **`src/infrastructure/config/store.ts`** — Imports `currentEnvironment` to read the `NODE_PUBLIC_PATH` environment variable at call time.
- **`tests/integration/image-acl.test.ts`**, **`tests/integration/product-multipart-write.test.ts`**, **`tests/integration/upload-claim.test.ts`**, **`tests/integration/upload-security.test.ts`**, **`src/modules/example/tests/contract/api.contract.test.ts`** — Import the two exports to obtain a valid image buffer and the target upload directory for their pipeline assertions.

## Notes

- Call `decodablePng()` in a `beforeAll` hook; it returns a Promise, not a synchronous value.
- `publicDirectory()` reads the environment **lazily** (at call time), so it reflects whatever `setup-file-sandbox.ts` set at that moment rather than capturing a value at module load.
- The PNG is always the same 4×4 solid-color image (r 10, g 20, b 30); do not expect it to vary between runs.
