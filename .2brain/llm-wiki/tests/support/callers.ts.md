---
source: tests/support/callers.ts
sha256: 42cba4109e0cf5cb8a1c93f68358fee33a0be87e842523892289d937423c649b
generated_at: 2026-10-15T12:56:06.695892+00:00
model: ollama:qwen3.8:27b
---

# tests/support/callers.ts

## Purpose

Test-fixture factories that build `AuthContext`, `Caller`, and `CallerContext` objects by **role name** rather than raw permission flags. It centralises the "who is acting" construction so that every integration and unit test across the codebase can express caller identity in one readable line, and so that a role-name change in the shared role registry surfaces here (at compile/fill time) instead of deep inside a single route's test.

## Key elements

- **`TEST_TENANT_ID`** (`'shop'`) – the single tenant every fixture targets; multi-tenant scenarios are the conformance suite's job.
- **`identity(id)`** *(private)* – fills the identity fields (`id`, `email`, `username`, `authTime`, etc.) that no authorization decision ever reads.
- **`asRole(role, id?)`** – generic factory returning an `AuthContext` with the given tenant role and `TEST_TENANT_ID`.
- **`asCustomer` / `asAdmin` / `asManager` / `asWarehouse` / `asSupport` / `asEditor` / `asModerator`** – one-line wrappers around `asRole` for each named preset, each with a doc comment describing the permission boundary.
- **`asOperator`** – the one factory that sets a *platform* role (`'operator'`) with tenant role `'guest'`; the deliberate counter-part to `asAdmin` in scope tests.
- **`testCallerContext`** – a ready-made `CallerContext` with an anonymous caller; the default for service-level unit tests that only need "some caller exists."
- **`callerAs(role, id?)`** – returns a `TenantCaller` (the shape an authorization decision / audit row sees) by delegating to `callerInScope(asRole(role), 'tenant')`.
- **`callerContextAs(role, id?)`** – wraps `callerAs` in a `TenantCallerContext`; for tests that need a *specific* role (e.g. the granter in an `assignRole` flow).
- **`strangerCaller()`** – shorthand for an anonymous/guest `Caller`.

## Relationships

- **`src/kernel/permissions.ts`** – provides `anonymousCaller` and `callerInScope`, the two kernel primitives this file composes. Every factory ultimately delegates to one of them.
- **Test files under `src/modules/access/tests/`, `src/modules/account/tests/`, `src/modules/addresses/tests/`** – import the role factories (`asCustomer`, `asManager`, `callerContextAs`, etc.) to set up the caller identity for their scenarios. This file is the common "who am I in this test" layer they share.

## Notes

- Role strings are plain `string` parameters, **not** a closed union. The doc comment asserts that a rename in `shared/authorization-roles.yaml` will "fail here" in practice (review / type-narrowing at call sites), but the compiler does not enforce it at this signature.
- `callerAs` hard-codes `'tenant'` scope. A platform-scope caller must be built explicitly via `callerInScope(asOperator(), 'platform')` — do not assume `callerAs` can produce one.
- `asOperator` is the only export that does **not** route through `asRole`; it constructs the `AuthContext` inline to set `roles.platform` instead of `roles.tenant`.
- All identity fields (`email`, `username`, `amr`, `twoFactorArmed`, …) are filler. If a test begins asserting on them, it is testing the wrong layer.
