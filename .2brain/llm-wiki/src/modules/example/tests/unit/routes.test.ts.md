---
source: src/modules/example/tests/unit/routes.test.ts
sha256: e296029ae24c01eca3a915f114d2f60e351f324fd241ba970991e236e5aad762
generated_at: 2026-10-29T03:58:43.483362+00:00
model: ollama:qwen3.8:27b
---

# src/modules/example/tests/unit/routes.test.ts

## Purpose

Unit tests for the example module's route table. They assert the exact set and order of mounted endpoints, verify the positional auth-guard boundary (which routes are open-read vs. keyed), and check middleware chain ordering on write endpoints. Because the guard split is defined purely by its position relative to `router.use(getAuth, isAuth)`, these tests encode that ordering as an invariant.

## Key elements

- **`describe('what is mounted')`** — asserts `routeSignatures(router)` returns exactly the 11 documented endpoint signatures in order.
- **`describe('the positional guard')`** — verifies `getAuth` is present on every route; `identityGuardIndex(guards)` is `-1` (absent) only on `GET /:id`; `requirePermissionGuard` appears on every route except `GET /:id`. Also pins `GET /:id` as the first signature and `POST /search` before `PUT /:id`.
- **`describe('what runs before the write')`** — for `POST /`, asserts the `example-create` controller is not the last handler (budget check precedes it). For `PUT /:id/cover`, asserts `uploads` → `upload.image` → controller ordering.
- **Middleware mocks** — `jest.mock` for `cache`, `rate-limit`, and `upload` middlewares, each delegating to a factory in `tests/support/routes.ts`, applied *before* the `router` import so the router is built with stubs.

## Relationships

- **`src/modules/example/routes.ts`** — the module under test; this file imports `{ router }` from it and asserts on the resulting handler chain.
- **`tests/support/routes.ts`** — provides the structural-inspection helpers (`routeSignatures`, `guardsOn`, `chainOf`, `identityGuardIndex`) used throughout, as well as the mock factories (`cacheMock`, `securityMock`, `storageMock`) referenced in the `jest.mock` calls.

## Notes

- Guard placement is **positional**, not name-based: the tests rely on `identityGuardIndex` returning `-1` to mean "no identity guard at all" (open read), and `≥ 0` to mean the guard sits somewhere in the chain (keyed route). A route typed on the wrong side of `router.use(getAuth, isAuth)` will pass type-checking but fail these tests.
- The assertion that `POST /search` precedes `PUT /:id` guards against Express matching the literal word "search" as an `:id` parameter.
- `chainOf` returns the full handler array per route; the "controller is last" check uses `chain.length - 1` as a proxy for the terminal handler, so any post-controller middleware (e.g., audit logging) would break the assertion.
