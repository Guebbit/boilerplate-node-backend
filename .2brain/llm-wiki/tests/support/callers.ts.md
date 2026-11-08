---
source: tests/support/callers.ts
sha256: f6cf30726c89a7297055253d08497a1d5870c7ad3f7b42d47446be60e47561cd
generated_at: 2026-11-08T09:51:54.209792+00:00
model: ollama:qwen3.8:27b
---

# tests/support/callers.ts

## Purpose

Provides role-named factories that produce fully-formed `AuthContext`, `Caller`, and `CallerContext` objects for tests. Tests name the *persona* they act as (e.g. `asWarehouse()`) instead of assembling individual permission flags, making authorization tests readable and keeping the role vocabulary aligned with the single source of truth in `shared/authorization-roles.yaml`.

## Key elements

- **`TEST_TENANT_ID`** – The one tenant (`'shop'`) every fixture belongs to. Multi-tenant scenarios live in the conformance suite.
- **`identity(id)`** (internal) – Builds the filler identity fields (email, username, amr, consent flags, etc.) that no authorization rule reads.
- **`asRole(role, id?)`** – Core factory. Returns an `AuthContext` with the given role, `authenticatorArmed` set for staff (non-audience) roles, and `verified` false only for `'unverified'`.
- **`asCustomer` / `asAdmin` / `asManager` / `asWarehouse` / `asSupport` / `asEditor` / `asModerator`** – One-liner presets over `asRole` with a descriptive doc comment for each persona's scope.
- **`asOperator`** – Platform-scope (`platform: 'operator'`) actor that is *not* a super-admin; the deliberate counter-part to `asAdmin` in scope-boundary tests.
- **`testCallerContext`** – A ready-made anonymous `CallerContext` for unit tests that call a service directly and don't care who the caller is.
- **`callerAs(role, id?)`** – Returns a `TenantCaller` (what an auth decision, audit row, or analytics event actually sees) by wrapping `asRole` in `callerInScope(…, 'tenant')`.
- **`callerContextAs(role, id?)`** – Same idea but returns a `TenantCallerContext`, for service tests that need a specific role (e.g. the granter in an `assignRole` call).
- **`strangerCaller()`** – Shorthand for `anonymousCaller()`, the `guest` as the evaluator sees it.

## Relationships

- **`src/kernel/permissions.ts`** – Imports `anonymousCaller`, `callerInScope`, and `isAudienceName`; these are the only kernel functions this file depends on.
- **Test consumers** – Imported by every integration/contract/unit test under `src/modules/access/tests/` and `src/modules/account/tests/` to construct the caller identity each test scenario requires.

## Notes

- Roles are validated at compile time against `shared/authorization-roles.yaml`: renaming a preset there breaks the import here, not a deep integration test.
- `asOperator` sets `tenant: null` and `platform: 'operator'`—it is deliberately *not* reachable via `asRole` and will not appear as a tenant-scope actor.
- `callerAs` always produces a **tenant**-scoped caller. For the rare platform-scope caller, the file's own doc says to call `callerInScope(asOperator(), 'platform')` inline at the call site.
- `testCallerContext` is anonymous; if a test needs a *named* role in a `CallerContext`, use `callerContextAs` instead.
