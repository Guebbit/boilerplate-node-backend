---
source: tests/contract/authorization-contract.test.ts
sha256: ed9be3569f9f3cdd7bd1f90d9ec82f00b9f61990ad17084d4365ee667a6fc316
generated_at: 2026-11-08T09:18:45.464343+00:00
model: ollama:qwen3.8:27b
---

# tests/contract/authorization-contract.test.ts

## Purpose

A contract-derived authorization sweep that asserts, over HTTP, two invariants for every mounted route: (1) any route behind an identity guard returns **401** to a callerless request, and (2) any route behind `requirePermission` returns **403** to exactly the tenant personas whose role file does not grant the required permission. Instead of 40+ hand-written 401/403 assertions scattered across per-module contract files, this file derives expected outcomes from the authorization model (`holds` + `PRESET_ROLES`) and tests them in one table-driven pass per route.

## Key elements

- **`TENANT_PERSONAS`** — Readonly list of every persona a human can log in as: `'unverified'`, `'customer'`, plus all `tenant`-scope `PRESET_ROLES` (excluding `'system'`, which is a job actor, never assigned to an account).
- **`fillParams(path)`** — Replaces `:param` path segments with `PLACEHOLDER_ID` (a 24-zero hex string) so requests are syntactically valid but hit no real resource.
- **`request(method, path)`** — Type-safe dispatcher that calls `api().get/post/put/delete/patch`, avoiding an unsafe indexed supertest call.
- **`describe("every route requiring a caller…")`** — Table-driven (`it.each`) over routes where `identityGuardIndex(route.guards) >= 0`. Asserts unauthenticated response is **401**.
- **`describe("every guarded route agrees with the role file…")`** — Table-driven over routes with `permissions.length > 0`. For each `TENANT_PERSONAS` entry, computes `allowed` via `holds(caller, action, subject)` (all stacked permissions must hold), then asserts **not 403** if allowed, **exactly 403** if not.
- **`setupTestDb()`** — Ensures a clean test database is available before assertions run.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/kernel/ability.ts` | Imports `holds` — the same predicate `requirePermissionGuard` uses — to derive expected allow/deny per role, keeping the test in sync with the model. |
| `src/kernel/permissions.ts` | Imports `PRESET_ROLES` to enumerate tenant personas at runtime, so a newly added YAML role is automatically included. |
| `tests/support/contract-routes.ts` | Imports `everyMountedRoute()` — the single source of "which routes exist and what guards/permissions they declare." |
| `tests/support/callers.ts` | Imports `callerAs(role)` to construct the caller object passed to `holds`. |
| `tests/support/http.ts` | Imports `api` (supertest instance) and `authenticateAsRole` (returns a bearer token for the given role). |
| `tests/support/routes.ts` | Imports `identityGuardIndex` to detect whether a route's guard array includes an identity guard (`isAuth` / `isAuthOrCredential`). |
| `tests/support/contract.ts` | Side-effect import (`import '@tests/contract'`) — sets up shared contract assertions or matchers. |
| `tests/support/setup-test-db.ts` | Calls `setupTestDb()` once at module scope to guarantee a clean DB. |
| `tests/cross-cutting/step-up-auth-routes.test.ts` | Sibling concern: that file verifies routes that *lost* their guard (spec-driven); this file verifies guards that are *present* answer correctly (guard-driven). Together they cover both failure modes. |

## Notes

- **401 vs. 403 split is intentional.** The identity-guard block only checks 401 (no caller at all). The permission block only checks 403 (caller present, role insufficient). A route that is missing its identity guard entirely will silently drop out of this file's route list — that gap is caught by `tests/cross-cutting/identity-guards-follow-the-spec.test.ts`.
- **"Allowed" does not mean 200.** The test asserts `not.toBe(403)` for allowed personas because the placeholder ID or empty body may still produce 404/422. It would be a defect if an allowed role got 403.
- **Stacked permissions.** A route that requires multiple permissions (e.g. product write + translation write) is open only if `holds` returns true for *every* permission. The test uses `route.permissions.every(…)`.
- **`system` role is excluded** from `TENANT_PERSONAS` because it is a job-execution actor, never assigned to a human account.
- **Platform-scope routes.** Because no tenant persona holds a `platform.` key, every platform route will be 403 for all `TENANT_PERSONAS` entries — this is expected and asserted in the same loop.
- **Module doc comment** explicitly cross-references `ownership-contract.test.ts` (same roles, different rows) and `request-contract.test.ts` (bodies instead of auth) as complementary sweeps.
