# src/modules/locales/tenants.ts

## Purpose

Defines the set of tenants (consumers of the translation service) that exist in a deployment. Tenants are configuration facts driven entirely by environment variables — not rows in a database — so that a typo cannot silently create an unserved keyspace. Every stored translation row is keyed by `(language, tenant, key)`, making this module the single source of truth for which tenants are valid.

## Key elements

- **`backendTenant()`** — Returns the id of the API's own tenant (`NODE_LOCALE_TENANT_BACKEND`, defaults to `'demo-be'`). Exactly one tenant always has this kind.
- **`frontendTenant()`** — Returns the id of the default frontend tenant (`NODE_LOCALE_TENANT_FRONTEND`, defaults to `'demo-fe'`). Used as the fallback when a messages request does not name a tenant.
- **`extraFrontendTenants()`** *(internal, not exported)* — Parses `NODE_LOCALE_TENANTS_EXTRA` (comma-separated `id=Label` pairs) into additional frontend tenant descriptors. Label falls back to the id if omitted.
- **`listTenants()`** — Returns every tenant as `LocaleTenantDescriptor[]` in a fixed order: backend, default frontend, then extras. Deduplicates by id (first occurrence wins).
- **`frontendTenantIds()`** — Convenience filter: ids of all tenants whose kind is `frontend`.
- **`isKnownTenant(id)`** — Boolean check whether an id names any tenant in this deployment.
- **`isFrontendTenant(id)`** — Boolean check whether an id names a frontend tenant (i.e. one whose dictionary may be served to a client).

## Relationships

- **`src/types/index.ts`** — Provides the `LocaleTenantKind`, `LocaleTenant`, and `LocaleTenantDescriptor` types this module imports and re-exports indirectly.
- **`src/modules/locales/controllers/get-locale-tenants.ts`** — Consumes `listTenants()` to populate the `GET /locales/tenants` response.
- **`src/modules/locales/services/messages.ts`** — Uses `frontendTenant()` as the default tenant for `GET /locales/{locale}/messages` and `isFrontendTenant` / `frontendTenantIds` to validate and scope served rows.
- **`src/modules/locales/controllers/get-locale-entries.ts`** — Validates tenant ids against `isKnownTenant` / `isFrontendTenant` when counting or listing entries.
- **`src/modules/locales/tests/unit/tenants.test.ts`** & **`tenants.fixture.ts`** — Unit-test this module's env-var parsing, deduplication, and predicate functions.

## Notes

- **Configuration, not data.** There is intentionally no admin-facing table for adding tenants. The only way to change the tenant list is to change environment variables and redeploy.
- **Exactly one backend.** `listTenants()` always emits the backend first and unconditionally; you cannot configure a deployment without one.
- **Dedup rule.** If the same id appears in multiple env vars (e.g. the backend id also listed in `EXTRA`), the first occurrence wins and the duplicate is silently dropped.
- **`extraFrontendTenants` is private.** External code must go through `listTenants()` or the predicate helpers; do not reach for a "raw extra list" that does not exist as an export.
- **Labels are display-only.** They have no effect on storage, routing, or identity; the id is the sole key.
