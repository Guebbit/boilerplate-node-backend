---
source: tests/unit/infrastructure/http/middlewares/route-flag.test.ts
sha256: 2cf46cc0cd77c15e45999fc1ea2eae68df5ce6e1ceda13cb4f28735218dbce78
generated_at: 2026-09-23T20:22:33.213062+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/http/middlewares/route-flag.test.ts

## Purpose

Unit tests for the `routeFlag` middleware, which writes a flag value onto `request.params` so that route patterns differing only in how they express a boolean (path segment vs. query param) can share a single controller input declaration. The file pins the middleware's own contract in isolation; the broader "express carries the mutated `params` through the handler chain" behaviour is covered by the products/users integration suites.

## Key elements

- **`makeRequest(params)`** – Helper wrapping `asStub<Request>` to produce a minimal Express `Request` carrying only the given `params` object.
- **`response`** – A bare `{} as Response` stub; never asserted against.
- **`describe('routeFlag')`** – Four cases:
  - Writes the declared flag (`hardDelete: 'true'`) onto `request.params` and calls `next` exactly once.
  - Confirms the value is the **string** `'true'`, not a boolean (route params are always strings; `readInput` performs the decode).
  - Accepts an explicit second argument (e.g. `'false'`) instead of defaulting to `'true'`.
  - Leaves pre-existing params (`id`, `productId`) untouched.

## Relationships

- **`src/infrastructure/http/middlewares/route-flag.ts`** — the system under test; the test calls `routeFlag(flagName, value?)` and inspects the `Request` it mutates.
- **`tests/support/stub.ts`** — provides `asStub<T>()`, used to create the stub `Request` object with only the `params` field populated.

## Notes

- The file's header comment intentionally scopes these tests: they verify the middleware's *own* write-and-passthrough contract, not the downstream `readInput` decoding or controller routing. Don't add integration-level assertions here.
- The string-typed flag is deliberate, not a bug. `readInput` is responsible for converting `'true'`/`'false'` into real booleans at the controller boundary.
- `response` is never spied on or asserted; if a future change makes `routeFlag` write headers or status, this stub will need real implementation.
