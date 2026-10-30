---
source: tests/support/callers.ts
sha256: f6cf30726c89a7297055253d08497a1d5870c7ad3f7b42d47446be60e47561cd
generated_at: 2026-10-29T07:06:31.902448+00:00
model: ollama:qwen3.8:27b
---

# tests/support/callers.ts

## Purpose

Test-support factory that builds `AuthContext` objects keyed by **role name** (e.g. `manager`, `warehouse`, `customer`) rather than by arbitrary flags, so that tests read as "a warehouse operator" instead of a bag of booleans. Every factory returns a full `AuthContext` because that is the shape services consume; only `roles` and `tenantId` are ever consulted by authorization logic. The file exists so that 15+ integration and contract tests across `access` and `account` share one canonical definition of each persona.

## Key elements

- **`TEST_TENANT_ID`** (`'shop'`) – the single tenant every fixture belongs to; multi-tenant behaviour is deferred to the conformance suite.
- **`asRole(role, id?)`** – generic factory: given a staff role or audience name, returns a populated `AuthContext` with correct `roles.tenant`, `verified`, and `authenticatorArmed` fields.
- **`asCustomer` / `asAdmin` / `asManager` / `asWarehouse` / `asSupport` / `asEditor` / `asModerator`** – one-liner wrappers over `asRole` with a descriptive JSDoc comment stating what that role can and cannot do.
- **`asOperator`** – platform-scope persona (`roles.platform: 'operator'`, `roles.tenant: null`); deliberately **not** a tenant super-admin, so it cannot read another shop's data.
- **`testCallerContext`** – a constant `CallerContext` with an anonymous caller; the default for unit tests that call a service directly and only need a non-throwing identity.
- **`callerAs(role, id?)`** – returns a `TenantCaller` (the shape an authorization decision or audit row sees) via `callerInScope(asRole(…), 'tenant')`.
- **`callerContextAs(role, id?)`** – returns a `TenantCallerContext` wrapping `callerAs`; use when a test needs a specific role (e.g. the granter in an `assignRole` call) rather than the anonymous default.
- **`strangerCaller()`** – shorthand for `anonymousCaller()`, representing an unauthenticated visitor.
- **`identity(id)`** *(internal)* – fills the non-authorization fields (`email`, `username`, `authTime`, `amr`, consent flags) so callers don't repeat boilerplate.

## Relationships

- **`src/kernel/permissions.ts`** – imported dependency. Provides `anonymousCaller`, `callerInScope`, and `isAudienceName`, the three permission utilities this file composes to build contexts.
- **Test consumers** (`src/modules/access/tests/…`, `src/modules/account/tests/…`) – all 14 listed test files import the role factories and `testCallerContext` to construct the `AuthContext` / `CallerContext` they pass into services and controllers under test.

## Notes

- Roles are **sourced from `shared/authorization-roles.yaml`**. If a preset is renamed in that YAML, the failure surfaces here (type-level) rather than deep inside a single route's integration test.
- `asOperator` is **platform-scoped**, not tenant-scoped. Passing it to `callerInScope(…, 'tenant')` would produce an empty caller; construct platform scope explicitly where needed.
- `testCallerContext` is **anonymous by design**. If a test needs a specific role (e.g. a role-granting flow), use `callerContextAs` instead—anonymous holds no key, so an elevated role can never be a valid subset of it.
- Identity fields (`email`, `authTime`, `amr`, consent booleans) are **filler**. No authorization rule reads them; do not add assertions against them.
