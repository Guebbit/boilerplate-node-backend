---
source: tests/contract/authorization-contract.test.ts
sha256: bc4bc5bce4a7a27e7455959f30bc9a9e672942f195bfdfcd4af08aed1b15b05d
generated_at: 2026-11-14T22:57:00.990478+00:00
model: ollama:qwen3.8:27b
---

# tests/contract/authorization-contract.test.ts

## Purpose

A contract-derived authorization sweep that asserts, for **every** mounted route, that (a) an unauthenticated request receives a 401, and (b) each tenant persona's response (403 vs. not-403) agrees with the `holds` predicate from the ability model for the route's declared permissions. It centralises the "does this guard fire correctly" question in one table-driven place rather than repeating 401/403 assertions across ~40 per-module contract files.

## Key elements

- **`PLACEHOLDER_ID` / `fillParams`** — Replaces `:param` segments with a syntactically valid but nonexistent 24-char hex id. Safe because the identity/permission guard runs before per-field validation.
- **`request(method, path)`** — Type-safe supertest dispatcher (switch over `HttpMethod`) that avoids an unsafe indexed call on the API object.
- **`TENANT_PERSONAS`** — `['unverified', 'customer', …preset tenant roles minus `system`]`. Derived from `PRESET_ROLES` so a new YAML role is automatically included.
- **`describe` "every route requiring a caller"** — Filters routes via `identityGuardIndex` (covers both `isAuth` and `isAuthOrCredential`), asserts 401 with no bearer.
- **`describe` "every guarded route agrees with the role file"** — Filters routes with `permissions.length > 0`; for each persona computes `allowed = route.permissions.every(ask => holds(caller, …))`, issues the request with a real bearer, and asserts `response.status === 403 ⟺ !allowed`. Stacked permission guards (e.g. product + translation) require **all** to be held.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/kernel/ability.ts` | Imports `holds` to derive the expected allow/deny per role+permission. |
| `src/kernel/permissions.ts` | Imports `PRESET_ROLES` to build `TENANT_PERSONAS`. |
| `tests/support/callers.ts` | Imports `callerAs` to construct the caller object passed to `holds`. |
| `tests/support/contract-routes.ts` | Imports `everyMountedRoute` — the single source of the route list under test. |
| `tests/support/contract.ts` | Side-effect import (`import '@tests/contract'`); registers shared contract helpers. |
| `tests/support/http.ts` | Imports `api` (supertest agent) and `authenticateAsRole` (obtains a real bearer token). |
| `tests/support/routes.ts` | Imports `identityGuardIndex` to identify which routes carry an identity guard. |
| `tests/support/setup-test-db.ts` | Imports `setupTestDb`; called once at module top to prepare the test database. |

## Notes

- **Complementary coverage, not redundant.** This file selects routes by the guard that is *present* (via `identityGuardIndex` / `permissions`). `tests/cross-cutting/identity-guards-follow-the-spec.test.ts` selects routes by the *spec* and would catch a route that lost its guard entirely (it would drop out of this file's list silently). A module's own contract file re-asserts 401/403 only when it also checks an error `code` or a side-effect on a row.
- **Allowed ≠ 200.** The second `describe` block asserts `status === 403 ⟺ !allowed`; an "allowed" request may still return 404 (placeholder id) or 422 (empty body). The test's invariant is purely about the 403 boundary.
- **`system` role excluded.** It is the actor a background job runs as and is never assigned to an account, so it is filtered out of `TENANT_PERSONAS`.
- **Platform routes.** A tenant-scope role never holds a `platform.` key, so for any platform route every persona in `TENANT_PERSONAS` is expected to 403 — the loop handles this without special-casing.
- **Sibling sweeps.** `ownership-contract.test.ts` covers the "correct role, wrong tenant row" axis; `request-contract.test.ts` is the mirror image covering request *bodies* rather than authorization.
