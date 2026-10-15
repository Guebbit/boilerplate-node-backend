---
source: tests/unit/infrastructure/http/named-handler.test.ts
sha256: 17c0b8c03df588ef07f80506525646c4719606cfea242952de41cb10c3c26460
generated_at: 2026-10-15T13:14:57.385912+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/http/named-handler.test.ts

## Purpose
Unit tests for `namedHandler`, verifying that it assigns the given operation name to the returned function while remaining a transparent pass-through (arguments and return value are forwarded unmodified).

## Key elements
- **`describe('namedHandler')`** — top-level test block; two cases inside.
- **Test: "names the returned function after the operation"** — calls `namedHandler('getThing', …)` and asserts `handler.name === 'getThing'`.
- **Test: "forwards the request and response and returns what the handler returns"** — builds stub `Request`/`Response` via `asStub`, a `jest.fn()` inner handler returning `'answer'`, then asserts the wrapper returns `'answer'` and the inner was called with the exact same two arguments.

## Relationships
- **`src/infrastructure/http/controller.ts`** — the module under test; this file imports `namedHandler` from it (via the `@infrastructure/http/controller` alias).
- **`tests/support/stub.ts`** — provides `asStub<T>()` used to create minimally-shaped, type-safe stand-ins for Express `Request` and `Response` without pulling in a real HTTP server.

## Notes
- The leading block comment states the design contract: the name is only useful if the response is untouched. Both tests exist to guard that contract.
- Path aliases (`@infrastructure/…`, `@tests/…`) are used; no relative imports appear here.
- Test runner is Jest (`jest.fn`, `describe`/`it`/`expect` globals).
