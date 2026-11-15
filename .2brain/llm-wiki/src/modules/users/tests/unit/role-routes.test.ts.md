---
source: src/modules/users/tests/unit/role-routes.test.ts
sha256: 58f0259fe93bb4f65b3f07d54860701c6b996a3af20f3f7e6c9511252ddff4d6
generated_at: 2026-11-14T22:40:25.680869+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/tests/unit/role-routes.test.ts

## Purpose

Unit test for the role-door router (`role-routes.ts`). It verifies two invariants: the router exposes exactly the two expected endpoints in mount order, and every endpoint is protected by a **session-only** authentication chain (`getAuth` → `isAuth` → `requirePermissionGuard`) rather than the broader `isAuthOrCredential` path.

## Key elements

- **`ALL`** – Array of the two expected route signatures (`POST /:id/assign-role`, `POST /:id/revoke-role`), used as the source of truth for both test cases.
- **"mounts exactly the two doors"** – Asserts `routeSignatures(router)` matches `ALL` exactly (order-sensitive), catching accidental extra or missing routes.
- **"asks a session, never a credential, then the permission"** (`.each`) – For every signature in `ALL`, pulls the guard chain via `guardsOn` and asserts:
  - `isAuthOrCredential` is absent.
  - `getAuth` appears before `isAuth`.
  - `isAuth` appears before `requirePermissionGuard`.
- **`jest.mock` blocks** – Stub out the `cache`, `route-flag`, and `upload` infrastructure middlewares using shared mock factories so they don't interfere with guard-order assertions.

## Relationships

- **`src/modules/users/role-routes.ts`** – The module under test; supplies the `router` instance that all assertions inspect.
- **`tests/support/routes.ts`** – Provides the test helpers imported directly (`routeSignatures`, `guardsOn`) and the middleware mock factories (`cacheMock`, `routeFlagMock`, `storageMock`) referenced inside the `jest.mock` factory functions.

## Notes

- The mock setup uses `jest.requireActual<typeof import('@tests/routes')>` inside each `jest.mock` factory. This is the standard pattern for accessing a helper that itself imports from the mocked module without triggering circular-mock issues.
- Guard-order assertions use index comparisons rather than exact array equality, so new guards inserted *before* `getAuth` or *after* `requirePermissionGuard` won't break the test — only a reordering or substitution of the three core guards will.
- The file is marked `@module` (no named exports); it is a pure test entry point.
