---
source: tests/unit/infrastructure/http/middlewares/route-flag.test.ts
sha256: 2cf46cc0cd77c15e45999fc1ea2eae68df5ce6e1ceda13cb4f28735218dbce78
generated_at: 2026-11-08T10:16:52.915583+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/http/middlewares/route-flag.test.ts

## Purpose

Unit tests that pin the `routeFlag` middleware's own contract: it writes a string flag onto `request.params` and calls `next`. This exists because the end-to-end flow (two routes reaching one controller) is covered by the products/users integration suites; these cases isolate the middleware so a regression in its write logic is caught without exercising the full handler chain.

## Key elements

- **`makeRequest(params?)`** – helper that builds a stub `Request` via `asStub<Request>`, pre-seeding `params` if provided.
- **`response`** – a bare `{}` cast to `Response`; never asserted on, satisfies the Express signature only.
- **`describe('routeFlag')`** – four cases:
  - *writes the flag onto request.params so readInput can find it* – verifies the new key appears alongside existing params and `next` is called once.
  - *writes a string, not a boolean* – asserts the value is the literal string `'true'`, matching the type of every route param.
  - *accepts an explicit value* – confirms the optional second argument (e.g. `'false'`) is written verbatim.
  - *does not disturb the params the route already matched* – ensures pre-existing keys (`id`, `productId`) are untouched.

## Relationships

- **`src/infrastructure/http/middlewares/route-flag.ts`** – the module under test; this file imports `routeFlag` and asserts its return value (a `RequestHandler`) writes to `request.params` and calls `next`.
- **`tests/support/stub.ts`** – provides `asStub<T>`, used here to produce a typed `Request` stub without pulling in the full Express app or supertest.

## Notes

- The middleware always writes a **string**, never a JS `boolean`. The decoding step (string → real `true`) is the responsibility of `readInput`, so any change to `routeFlag`'s value type will break that contract here before it reaches integration tests.
- The `response` object is intentionally empty and never asserted; if a future version of `routeFlag` needs to set headers or status, this stub will need to be upgraded to a mock with spies.
