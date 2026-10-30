---
source: src/modules/access/module.ts
sha256: 64ee9f4a54c41d6dea3d9d3144ef1262466db13b8a86807ee251a6552fb5eed4
generated_at: 2026-10-29T02:22:27.626810+00:00
model: ollama:qwen3.8:27b
---

# src/modules/access/module.ts

## Purpose

Defines the **access** module manifest — the identity-and-access domain that `kernel/permissions.ts` and `kernel/ability.ts` query for tenants and memberships. It is intentionally routeless (no HTTP endpoints) and exists purely to expose the tenant/membership collections to other modules via the barrel, while also declaring the module's personal-data obligations (GDPR Art. 15 collection and hard-delete erasure).

## Key elements

- **`default` export** — an object satisfying the `AppModule` type. Contains:
  - `name: 'access'` — the module's registry key.
  - `personalData` — a single section (`roles`) with:
    - `collect(subject)` — calls `accessService.membershipsOf(subject.userId)` and returns an array of `{ role, scope }` objects. Deliberately omits the tenant id (single-shop deployment).
    - `erase({ userId }, session)` — calls `accessService.eraseMemberships(userId, session)` inside the caller's hard-delete transaction.

## Relationships

- **`src/kernel/registry.ts`** — imports the `AppModule` type that this manifest must satisfy.
- **`src/modules/access/services/index.ts`** — provides `accessService`, the sole service dependency; all data access flows through it.
- **`src/modules.ts`** — the top-level module registry that imports this module's default export and makes it available to the rest of the application.
- **`src/modules/account/module.ts`** / **`src/modules/account/openapi.yaml`** — consumer modules that rely on the access barrel for membership/role lookups at runtime.
- **`tests/integration/erasure.test.ts`** — exercises the `erase` path end-to-end (hard-delete transaction integration).

## Notes

- The module is **routeless by design**; the boilerplate never creates shops or grants roles over HTTP. Do not add a router here — mount any future endpoints in a consumer module.
- `collect` returns only `role` and `scope`, not the tenant id. This is an intentional scoping choice for the single-tenant deployment; if multi-tenant support is added, revisit what Art. 15 disclosures should include.
- `erase` participates in the **caller's** transaction (the `session` is passed in), not its own. The caller owns commit/rollback.
- The doc-comment references `./model.ts` for the justification of why this is a module rather than kernel code — that file is not in the dependency graph and may not exist yet or may have been renamed.
