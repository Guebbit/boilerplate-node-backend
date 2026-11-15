---
source: src/modules/example/tests/unit/routes.test.ts
sha256: a674f36f80703dc30435d716e8a66b7a92fe63f7129985d3687d2479abd867f2
generated_at: 2026-11-14T20:02:37.406743+00:00
model: ollama:qwen3.8:27b
---

# src/modules/example/tests/unit/routes.test.ts

## Purpose

Verifies the **mount order** and **positional auth guard** of the example module's Express router. Because the sign-in gate is enforced purely by placement (everything after `router.use(getAuth, isAuth)`), a misplaced route is silently wrong; these tests pin down *which* routes sit above the gate, *which* sit below, and *in what order* they are registered.

## Key elements

- **`routeSignatures(router)`** – Flattens the router into an ordered array of `"METHOD /path"` strings; used to assert the exact endpoint list and their sequence.
- **`guardsOn(router, signature)`** – Returns the middleware stack (by name) for a single route; used to confirm which guards apply.
- **`identityGuardIndex(guards)`** – Locates the index of the identity-enforcing guard in the stack; `-1` means "caller resolved, never required" (open read); `≥ 0` means "keyed" (sign-in required).
- **`chainOf(router, signature)`** – Returns the full handler chain for a route; used to assert that budget/upload middleware precedes the controller.
- **Jest mocks** for `cache`, `rate-limit`, and `upload` – Replaced via `jest.mock` with factories pulled from `@tests/routes` (`cacheMock`, `securityMock`, `storageMock`) so the real middleware doesn't execute during route inspection.
- **`describe('example routes: what is mounted')`** – Pins the exact 11-route list and order.
- **`describe('example routes: the positional guard')`** – Asserts `GET /:id` is above the gate (open), all other routes are below (keyed), `GET /:id` is first, and `POST /search` precedes any `/:id` write.
- **`describe('example routes: what runs before the write')`** – Asserts `example-create` budget and `upload.image` appear earlier in the chain than the controller handler.

## Relationships

- **`src/modules/example/routes.ts`** – The module under test; this file imports its exported `router` and inspects its middleware stack. No mutations are made.
- **`tests/support/routes.ts`** – Supplies all test helpers (`routeSignatures`, `guardsOn`, `identityGuardIndex`, `chainOf`) and the mock factories (`cacheMock`, `securityMock`, `storageMock`) used to stub infrastructure middleware during inspection.

## Notes

- The entire file is **positional by design**: the module doc comment states that if a route lands on the wrong side of the auth gate, nothing is visibly wrong at runtime. These tests exist solely to catch that class of silent regression.
- `GET /:id` is the **only** route expected above the identity gate. Adding any new open-read route requires updating both this test and the gate position in `routes.ts`.
- The `jest.mock` factories call `jest.requireActual('@tests/routes')` rather than the real middleware modules—this avoids pulling in I/O or network code while still giving the router named middleware it can be matched against in assertions.
- Route-order assertions (`/search` before `/:id` writes) are a **collision-prevention** guard: Express matches `/:id` parametrically, so a literal path like `/search` must be registered first or the segment would be swallowed as an `id`.
