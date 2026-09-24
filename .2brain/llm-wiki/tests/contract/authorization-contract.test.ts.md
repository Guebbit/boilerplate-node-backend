---
source: tests/contract/authorization-contract.test.ts
sha256: c028cea2d1570b8ee36698b0c4f0ffc097ee7076d04046067bb1e0df97ff40e5
generated_at: 2026-09-23T19:51:40.829720+00:00
model: ollama:qwen3.8:27b
---

# tests/contract/authorization-contract.test.ts

## Purpose

A contract-derived authorization sweep that asserts, for every route discovered behind `isAuth` or `requirePermissionGuard`, that the HTTP status matches what `shared/authorization-roles.yaml` dictates for each of the six non-admin tenant roles. It closes the gap where intermediate roles were never exercised through the HTTP surface, and it derives the expected allow/deny decision from the same `holdsKey` query the runtime guard uses, eliminating a hand-maintained expectation.

## Key elements

- **`PLACEHOLDER_ID`** / **`fillParams`** — Fills `:param` path segments with a syntactically valid but nonexistent 24-char id so the auth guard runs before any field validation.
- **`request(method, path)`** — Type-safe supertest dispatcher (GET/POST/PUT/DELETE/PATCH) that avoids an unsafe indexed call.
- **`describe('…requiring a caller…')`** — Iterates every `isAuth`-guarded route; asserts 401 + API-spec conformance with no credentials.
- **`describe('…requiring an admin…')`** — Iterates `requirePermissionGuard` routes (excluding `cart.self.checkout`, which a plain customer legitimately holds); asserts 403 for `authenticateAs('user')`.
- **`NON_ADMIN_TENANT_ROLES`** — The six roles (`customer`, `manager`, `warehouse`, `support`, `editor`, `moderator`) swept in the per-role loop.
- **`describe('…agrees with the role file…')`** — For each guarded route × each non-admin role, calls `holdsKey(callerAs(role), route.permissionKey)` to derive the expected decision, then asserts non-403 when allowed and 403 + spec when denied.

## Relationships

- **`src/kernel/ability.ts`** — Provides `holdsKey`, the same predicate the runtime guard evaluates; the test uses it to derive expected outcomes from the model rather than hardcoding them.
- **`tests/support/contract-routes.ts`** — Source of `everyMountedRoute()` and the `MountedRoute` type; supplies the route inventory (method, path, guards, permissionKey) that drives all three `it.each` tables.
- **`tests/support/http.ts`** — Provides `api()` (supertest agent), `authenticateAs`, and `authenticateAsRole` for issuing requests with specific callers.
- **`tests/support/callers.ts`** — Provides `callerAs(role)`, which constructs the caller object passed to `holdsKey` for the per-role derivation.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` runs once to give the HTTP server a reachable database (guards hit the DB before responding).
- **`tests/support/contract.ts`** — Side-effect import that registers the `toSatisfyApiSpec` matcher used in every assertion.

## Notes

- The test is table-driven (`it.each` over the route list), so adding a new guarded route automatically adds a case — no per-module test file needed.
- `cart.self.checkout` is explicitly excluded from the generic non-admin 403 block because `customer` holds that key by design; the per-role sweep covers it correctly.
- "Allowed" does not mean 200: a route may still return 404 or 422 on a placeholder id or empty body. The invariant is only *not* 403.
- Path params are filled with a nonexistent id on purpose — the guard must short-circuit before any resolution logic, and a route where the id *did* change the 401/403 outcome would be a defect this sweep catches.
- This file is the authorization mirror of `request-contract.test.ts` (which sweeps request bodies instead).
