---
source: tests/contract/authorization-contract.test.ts
sha256: ed9be3569f9f3cdd7bd1f90d9ec82f00b9f61990ad17084d4365ee667a6fc316
generated_at: 2026-10-29T06:38:37.688118+00:00
model: ollama:qwen3.8:27b
---

# tests/contract/authorization-contract.test.ts

## Purpose

Table-driven authorization sweep that asserts two invariants over every mounted route in one place: (1) any route with an identity guard returns **401** to a callerless request, and (2) any route behind `requirePermission` returns **403** to exactly the tenant personas that lack its permission rule, as derived by `holds`. This replaces 40+ duplicated 401/403 assertions that would otherwise live in each module's own contract file, and makes "should this role reach this route" a fact derived from the role model rather than a hand-maintained expectation.

## Key elements

- **`PLACEHOLDER_ID` / `fillParams`** – A syntactically valid, nonexistent 24-char id used to fill `:param` path segments. Safe because guards run before per-field validation, so the id value cannot alter a 401/403 outcome.
- **`request(method, path)`** – Switch-based dispatcher through supertest (`api().get/post/put/delete/patch`) to avoid unsafe indexed calls.
- **`TENANT_PERSONAS`** – Read-only array of every tenant-scope persona a person can log in as: `unverified`, `customer`, and all `PRESET_ROLES` with `scope === 'tenant'` excluding `system`.
- **`describe` "every route requiring a caller"** – Filters routes where `identityGuardIndex(route.guards) >= 0`; asserts a bare (unauthenticated) request gets **401**.
- **`describe` "every guarded route agrees with the role file"** – For each route with non-empty `permissions` and each persona in `TENANT_PERSONAS`, computes `allowed` via `route.permissions.every((ask) => holds(caller, ask.action, ask.subject))`, then asserts the response is **not 403** when allowed, or **is 403** when not.

## Relationships

- **`src/kernel/ability.ts`** – Imports `holds`, the same predicate `requirePermissionGuard` uses at request time, to derive expected allow/deny per role.
- **`src/kernel/permissions.ts`** – Imports `PRESET_ROLES` to build `TENANT_PERSONAS` (filtered to tenant scope, excluding `system`).
- **`tests/support/contract-routes.ts`** – Imports `everyMountedRoute()` to obtain the full route list with `guards` and `permissions` metadata.
- **`tests/support/routes.ts`** – Imports `identityGuardIndex` to detect whether a route mounts an identity guard.
- **`tests/support/http.ts`** – Imports `api` (supertest agent) and `authenticateAsRole` (obtains a bearer token for a persona).
- **`tests/support/callers.ts`** – Imports `callerAs` to construct a caller object for `holds`.
- **`tests/support/contract.ts`** – Imported for side effects (shared contract setup).
- **`tests/support/setup-test-db.ts`** – Imports `setupTestDb` to initialise a test database before the suite.

## Notes

- **`system` role is intentionally excluded** from `TENANT_PERSONAS`: it is the actor a background job runs as and is never assigned to a logged-in account.
- **"Allowed" does not mean 200.** The assertion is `not.toBe(403)` because the placeholder id (or an empty body) may still produce 404 or 422.
- **Stacked permissions require all to hold.** A route that asks for two rules (e.g. product write + translation) is open only to a role that holds *every* one—enforced by `.every()`.
- **Complementary test:** `tests/cross-cutting/identity-guards-follow-the-spec.test.ts` picks routes *by the spec* (YAML); this file picks them *by the guard* (code). A route that silently loses its guard drops out of this file's list rather than failing here—so both files together close the gap.
- **Sibling sweeps:** `ownership-contract.test.ts` covers the "role reaches a route but targets another customer's row" half; `request-contract.test.ts` mirrors this file but over request *bodies* instead of authorization headers.
