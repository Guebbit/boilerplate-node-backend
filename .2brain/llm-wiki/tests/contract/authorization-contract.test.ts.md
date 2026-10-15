---
source: tests/contract/authorization-contract.test.ts
sha256: 6688af143df86184df445dffea5ce416fb63eea6c9fe6f9445ea55e3f6e826dc
generated_at: 2026-10-15T12:32:01.056382+00:00
model: ollama:qwen3.8:27b
---

# tests/contract/authorization-contract.test.ts

## Purpose

A table-driven authorization sweep that derives expected 401/403 outcomes for **every** mounted HTTP route from the authorization model itself (`shared/authorization-roles.yaml` via `holdsKey`), rather than from hand-maintained per-route expectations. It closes the gap where intermediate tenant roles (manager, warehouse, support, editor, moderator) were never exercised against the HTTP surface individually.

## Key elements

- **`fillParams(path)`** — replaces `:param` segments with a fixed placeholder UUID (`000000000000000000000000`) so the auth guard runs before any per-field validation that might reject a bad id.
- **`request(method, path)`** — thin dispatch wrapper over the supertest `api()` handle; avoids an unsafe indexed call.
- **`NON_ADMIN_TENANT_ROLES`** — the six roles swept in the per-role describe block (`customer`, `manager`, `warehouse`, `support`, `editor`, `moderator`); `admin` is deliberately excluded.
- **`describe` block 1 — "requires a caller"** — asserts 401 for every route whose guards include `isAuth`.
- **`describe` block 2 — "requires an admin"** — asserts 403 for routes guarded by `requirePermissionGuard` whose `permissionKey` is one a plain `customer` does **not** hold (routes a `customer` legitimately holds are skipped here and covered in block 3).
- **`describe` block 3 — "agrees with the role file, for every non-admin role"** — for each route with a `permissionKey`, iterates all six roles, computes `allowed` via `holdsKey` + the `exactPermission` / `heldKeys` check, and asserts 403 when not allowed or **not-403** (could be 404/422) when allowed. This is the sweep that catches a wrong-key bug (e.g. guard reads `users.any.update` when the role file only grants `users.any.read`).

## Relationships

- **`src/kernel/ability.ts`** — imports `heldKeys` and `holdsKey`; the test uses the same functions the `requirePermissionGuard` uses internally, so "should this role reach this route" is derived from the model, not hardcoded.
- **`tests/support/contract-routes.ts`** — imports `everyMountedRoute()` and the `MountedRoute` type; this is the single source of truth for which routes exist and which guards/permissions they carry.
- **`tests/support/callers.ts`** — imports `callerAs(role)` to construct a caller object for the `holdsKey` check.
- **`tests/support/http.ts`** — imports `api` (supertest handle), `authenticateAs`, and `authenticateAsRole` to issue authenticated requests.
- **`tests/support/contract.ts`** — side-effect import; installs shared contract matchers/expectations used by the assertions.
- **`tests/support/setup-test-db.ts`** — calls `setupTestDb()` before any test runs so the guard's session/permission lookups can resolve.

## Notes

- The test is a **mirror** of `request-contract.test.ts`, which sweeps request *bodies* against the contract; this file sweeps *authorization headers/roles*.
- The per-role loop in block 3 asserts `not.toBe(403)` (not a specific success code) for allowed roles because a placeholder id or empty body may legitimately yield 404/422 — the invariant under test is purely "the guard does not reject on a grant the role file says exists."
- `exactPermission` routes require the *literal* key in `heldKeys(caller)`, not just a broader sibling key; the test mirrors that logic so a wide-read grant does not falsely satisfy an exact-guard route.
- `admin` is excluded from the per-role sweep by design: it holds every tenant key by construction, so asserting 403-for-allowed for it would just re-verify the role file key-by-key (already covered by `tests/unit/kernel/permissions.test.ts`).
