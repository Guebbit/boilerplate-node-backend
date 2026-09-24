---
source: tests/support/callers.ts
sha256: 33ed74598e46d3e31e305bec59e6054857d60e23f3d07616d72a95b4b90e3b51
generated_at: 2026-09-23T20:09:26.212075+00:00
model: ollama:qwen3.8:27b
---

# tests/support/callers.ts

## Purpose

Provides role-based `AuthContext`, `Caller`, and `CallerContext` fixtures for the test suite. By organizing actors around the **role** string (rather than individual permission flags), test code reads as intent (`asWarehouse()`) and role-name typos surface at import time instead of failing deep inside an integration test. Every factory fills in a complete identity so services receive a well-formed context even though only `roles` and `tenantId` drive authorization.

## Key elements

- **`TEST_TENANT_ID`** (`'shop'`) — the single tenant every fixture in this file belongs to; multi-tenant cases live in the conformance suite.
- **`asRole(role, id?)`** — core factory; returns a full `AuthContext` with the given tenant role and a throwaway identity.
- **`asCustomer` / `asAdmin` / `asManager` / `asWarehouse` / `asSupport` / `asEditor` / `asModerator`** — one-liner wrappers around `asRole` that document what each role _can_ and _cannot_ do in the doc comment.
- **`asOperator(id?)`** — the platform-level operator (`tenant: 'guest'`, `platform: 'operator'`); intentionally **not** a tenant super-admin, making it the natural counterpart to `asAdmin` in scope tests.
- **`testCallerContext`** — an anonymous `CallerContext` for unit tests that call a service directly and don't care who the caller is.
- **`callerAs(role, id?)`** — returns a `TenantCaller` (what an authorization decision, audit row, or analytics event actually sees) via `callerInScope(asRole(role, id), 'tenant')`.
- **`callerContextAs(role, id?)`** — wraps `callerAs` into a `TenantCallerContext` for service tests that need a _specific_ role (e.g., the granter in an `assignRole` call).
- **`strangerCaller()`** — shorthand for `anonymousCaller()`, the evaluator's view of an unauthenticated actor.

## Relationships

- **`src/kernel/permissions.ts`** — source of the two primitives this file composes: `anonymousCaller()` (anonymous identity) and `callerInScope()` (wraps a context into a `Caller` for a given scope). Every non-tenant-scope caller in the test suite goes through `callerInScope` here.
- **Integration / contract test files** (account, addresses, api-keys, cart, delivery, access) — consume `asRole`, the role wrappers, `callerAs`, and `callerContextAs` to build the `AuthContext` / `CallerContext` they pass into services and controllers. They never construct a raw `AuthContext` inline.

## Notes

- Role strings are expected to match presets in `shared/authorization-roles.yaml`. Renaming a preset there breaks this file's factories (and every test that imports them) rather than failing silently inside a single route test.
- `asOperator` is the only factory that sets `platform` to a non-null value; it deliberately sets `tenant: 'guest'` so it holds **no** tenant key. Pair it with `asAdmin` in any test that asserts cross-scope denial.
- Identity fields (`email`, `username`, `authTime`, `amr`) are filler — authorization logic never reads them. Change them only if a test asserts on the serialized caller shape.
- `testCallerContext` is a **shared mutable** export (anonymous by default). Tests that mutate it should clone first; prefer `callerContextAs` when a specific role is needed.
