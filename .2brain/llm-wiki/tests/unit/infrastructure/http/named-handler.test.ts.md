---
source: tests/unit/infrastructure/http/named-handler.test.ts
sha256: 17c0b8c03df588ef07f80506525646c4719606cfea242952de41cb10c3c26460
generated_at: 2026-11-08T10:17:23.359857+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/http/named-handler.test.ts

## Purpose
Unit tests for the `namedHandler` utility from the HTTP controller module. Verifies that `namedHandler` assigns the given operation name to the returned function while preserving the original handler's behavior (argument forwarding and return value passthrough).

## Key elements
- **`describe('namedHandler', …)`** — test suite scoped to the single unit under test.
- **"names the returned function after the operation"** — asserts `handler.name` equals the string passed as the first argument to `namedHandler`.
- **"forwards the request and response and returns what the handler returns"** — uses `asStub<Request>` / `asStub<Response>` to fabricate Express objects, a `jest.fn()` as the inner handler, and confirms both that the inner handler receives the exact stubs and that its return value is surfaced unchanged.

## Relationships
- **`src/infrastructure/http/controller.ts`** — provides the `namedHandler` function under test (imported as `@infrastructure/http/controller`).
- **`tests/support/stub.ts`** — provides `asStub<T>`, a helper that creates a typed object usable as an Express `Request` or `Response` stand-in without pulling in real Express instances.

## Notes
- The tests import `Request` and `Response` **as types only** (`import type`), so no runtime dependency on Express is introduced by the test file itself.
- The inner handler in the second test is a `jest.fn()` that explicitly returns the string `'answer'`; the assertion `expect(result).toBe('answer')` confirms `namedHandler` does not wrap, mutate, or replace the return value.
