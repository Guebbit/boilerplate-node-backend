---
source: tests/cross-cutting/write-routes-are-guarded.test.ts
sha256: 807262ecf7b2a3a45dfa670244da3b87e9c12b9dbb9aff71908ec0e54e08fd33
generated_at: 2026-09-23T20:01:24.150714+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/write-routes-are-guarded.test.ts

## Purpose

Enforces the app-wide invariant that every write route (POST/PUT/PATCH/DELETE) on every routed module is authenticated and gated behind a `requirePermission` key, unless explicitly exempted. It exists so the guarantee is stated once globally rather than re-asserted per-module, meaning a newly added module inherits the check automatically without needing its own `routes.test.ts`.

## Key elements

- **`WRITE_EXCEPTIONS`** — `Record<string, WriteException>` keyed `"${module} ${METHOD} ${path}"`. Each entry records `requiresAuth` (whether a session is still needed) and a human-readable `reason`. Covers all deliberate opt-outs: credential-exchange routes (login, signup, reset), token-in-request routes (verify-confirm, email-change-confirm, 2FA steps), own-resource CRUD (cart, wishlist, addresses, account settings), and the payment webhook.
- **`WriteException`** — interface: `{ requiresAuth: boolean; reason: string }`.
- **`WRITE_METHODS`** — `Set(['POST','PUT','PATCH','DELETE'])`; the methods this test treats as state-changing.
- **`writesOn(router)`** — filters `effectiveRouteTable` to write methods and returns `"METHOD path"` signatures.
- **`MODULES_ROOT`** — filesystem path to `src/modules`, used to cross-check that `ROUTED_MODULES` covers every module directory that has a `routes.ts`.
- **Three test groups** inside the `describe` block:
  1. Module-coverage: `ROUTED_MODULES` keys match the set of directories containing `routes.ts`.
  2. Stale-exception check: no `WRITE_EXCEPTIONS` key references a route that is no longer mounted.
  3. Per-route guard assertion (via `it.each`): default routes must have an identity guard *before* `requirePermissionGuard`; exception routes must lack the permission guard and match their `requiresAuth` flag.
- **Jest mocks** — cache, route-flag, upload/storage, and rate-limit middlewares are replaced with shared factories from `@tests/routes` so the route tables are introspectable without real infrastructure.

## Relationships

- **`tests/support/routed-modules.ts`** — exports `ROUTED_MODULES`, the map from module name to its mounted Express `Router`. This test iterates it to enumerate every write route and cross-checks its completeness against the filesystem.
- **`tests/support/routes.ts`** — provides the introspection helpers (`effectiveRouteTable`, `guardsOn`, `identityGuardIndex`) and the mock factories (`cacheMock`, `routeFlagMock`, `storageMock`, `securityMock`) used both in the `jest.mock` calls and in asserting guard order.

## Notes

- The `observability` module is skipped in the per-route loop because it mounts zero writes; `it.each` throws on an empty table.
- Exception keys use the exact signature format `${moduleName} ${METHOD} ${routePath}` as produced by `writesOn`, including parameter placeholders like `:id`.
- The test asserts *ordering*: the identity guard index must be strictly less than the index of `requirePermissionGuard`. A route that has both but in the wrong order will fail.
- Adding a new write route without adding a `WRITE_EXCEPTIONS` entry (or without adding the guards to the route) will fail this test — that is the intended fail-safe.
- `requiresAuth: false` does **not** mean "public"; it means the credential is carried in the request itself (token, cookie, signed body) rather than in a session.
