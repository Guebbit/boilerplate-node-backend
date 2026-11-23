---
source: src/modules/example/tests/unit/routes.test.ts
source_sha256: a674f36f80703dc30435d716e8a66b7a92fe63f7129985d3687d2479abd867f2
context_sha256: 7b03a0abe11750aa8f3346528f0723c1eaec5915842de70778601b8b67dc0625
generated_at: 2026-11-22T05:15:22.960343+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/example/tests/unit/routes.test.ts

## Purpose
Unit test that pins the route table of the example module's router. Routes below `router.use(getAuth, isAuth)` are protected purely by their position, and a route typed in the wrong half looks fine either way. This file therefore asserts the mounted endpoints, their order, and their guards positionally.

## Key elements
- **Cache, rate-limit and upload mocks**: `jest.mock` calls for `@infrastructure/http/middlewares/cache`, `.../rate-limit` and `.../upload`. They are replaced with `cacheMock()`, `securityMock()` and `storageMock()` from `@tests/routes`.
- **`what is mounted`**: asserts `routeSignatures(router)` equals the exact list of 11 endpoints in order, starting with `GET /:id` and ending with `PUT /:id/cover`.
- **`the positional guard`**:
  - `GET /:id` has `getAuth` but no identity guard (`identityGuardIndex` is -1) and no `requirePermissionGuard`. This is the open read, above the gate.
  - The other 10 routes (via `it.each`) have `getAuth`, an identity guard at index >= 0, and `requirePermissionGuard`.
  - `GET /:id` must be the first signature, so the gate cannot be moved above it.
  - `POST /search` must be declared before `PUT /:id`, so "search" is never read as an id.
- **`what runs before the write`**:
  - On `POST /`, the `example-create` handler must come before the last handler in the chain (the controller).
  - On `PUT /:id/cover`, `upload.image` must come before the last handler in the chain.

## Relationships
- Imports `router` from `src/modules/example/routes.ts` and inspects its route stack. It does not make requests.
- Uses the helpers `chainOf`, `routeSignatures`, `guardsOn`, `identityGuardIndex` and the mock factories `cacheMock`, `securityMock`, `storageMock` from `tests/support/routes.ts`, imported through the `@tests/routes` alias.

## Notes
- The mocks are installed before `routes.ts` is imported, so the router is built with stubbed middleware. Each mock factory loads `@tests/routes` with `jest.requireActual`.
- The chain tests assume the controller is the last handler. They only check that the named handler comes before it, not that it is directly adjacent.
- The tests only change if the route table changes, so a failure after adding or moving a route is expected. Update the signature list and guard lists to match.
