---
source: src/modules/access/module.ts
sha256: 64ee9f4a54c41d6dea3d9d3144ef1262466db13b8a86807ee251a6552fb5eed4
generated_at: 2026-11-08T03:56:38.799049+00:00
model: ollama:qwen3.8:27b
---

# src/modules/access/module.ts

## Purpose

Module manifest for the **access** domain (tenants and memberships). It registers the module with the kernel registry, declares a single personal-data section for GDPR Art. 15 / erasure compliance, and deliberately exposes no HTTP routes. It exists as a module (not kernel code) because it owns the tenant/membership collections and is consumed by several sibling modules.

## Key elements

- **Default export** — An object satisfying `AppModule` from `@kernel/registry`. Contains:
  - `name: 'access'` — the module identifier used by the registry.
  - `personalData[0]` (`section: 'roles'`) — the sole personal-data descriptor:
    - `collect(subject)` — calls `accessService.membershipsOf(userId)` and returns an array of `{ role, scope }` pairs. Deliberately omits the tenant id (single-tenant deployment; the scope alone answers "what can this account do").
    - `erase({ userId }, session)` — delegates to `accessService.eraseMemberships(userId, session)`, which joins the caller's hard-delete transaction.
- **`accessService`** (imported from `./services`) — the only service this manifest touches; provides membership read and erase operations.

## Relationships

- **`src/kernel/registry.ts`** — Provides the `AppModule` type constraint; this file's default export is validated against it.
- **`src/modules.ts`** — The top-level barrel that imports and registers this module (alongside all others).
- **`src/modules/access/services/index.ts`** — Supplies `accessService`; the sole service dependency used in `collect` and `erase`.
- **`src/modules/account/module.ts`** (and `api-keys`, `example`, `orders`, `payments`, `returns`, `users`) — Sibling modules that consume the access domain's tenant/membership data through this barrel.
- **`tests/integration/erasure.test.ts`** — Integration test that exercises the `erase` path end-to-end.
- **`src/modules/access/authorization.yaml`** / **`openapi.yaml`** — Co-located config files in the same module directory; the OpenAPI spec is effectively empty for this module (no routes), and the authorization YAML describes role/scope rules the service enforces.

## Notes

- **Routeless by design.** The header comment is explicit: no boilerplate endpoint creates a shop or grants a role, so there is no URL to mount. If a future feature adds such an endpoint, this manifest would need a `routes` entry.
- **`collect` intentionally drops tenant id.** The inline comment justifies this as a single-tenant deployment; if multi-tenant support is added, the shape of the returned object must change.
- **`erase` is transactional.** It receives a `session` parameter and joins the caller's existing hard-delete transaction rather than opening its own — do not call it outside that contract.
