---
source: src/modules/locales/tenants.ts
sha256: 5268dd55ac0e5fc4edf65bdbf36c197f04f2239b1a2d66f0e94c55556efb9804
generated_at: 2026-09-23T18:53:06.952125+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/tenants.ts

## Purpose

Defines the set of tenants (translation keyspaces) this deployment serves. A tenant is one consumer of the translation service, identified by the `(language, tenant, key)` tuple so that two tenants can share a key while meaning unrelated strings. The tenant list is **configuration** (read from environment variables at call time), not data — no rows are stored or managed in a database.

## Key elements

- **`backendTenant()`** – Returns the API's own tenant id from `NODE_LOCALE_TENANT_BACKEND` (default `"demo-be"`). This tenant is layered over deployed files by `@infrastructure/i18n`.
- **`frontendTenant()`** – Returns the default frontend tenant id from `NODE_LOCALE_TENANT_FRONTEND` (default `"demo-fe"`). Used when a client omits a tenant.
- **`extraFrontendTenants()`** *(internal)* – Parses `NODE_LOCALE_TENANTS_EXTRA` (comma-separated `id=Label` pairs) into `LocaleTenantDescriptor[]` with `kind: frontend`.
- **`listTenants()`** – Returns the full, de-duplicated tenant list ordered: backend → default frontend → extras. First spelling wins on duplicate ids.
- **`frontendTenantIds()`** – Returns only the ids of frontend tenants (the rows that `entryCount` counts and the messages route may serve).
- **`isKnownTenant(id)`** – True if the id matches any tenant in `listTenants()`.
- **`isFrontendTenant(id)`** – True if the id names a frontend tenant specifically (i.e. its dictionary may be served).

## Relationships

- **`src/types/index.ts`** – Imports the `LocaleTenant`, `LocaleTenantDescriptor`, and `LocaleTenantKind` types used throughout this file.
- **`src/modules/locales/repository.ts`**, **`services/messages.ts`**, **`services/languages.ts`**, **`services/capabilities.ts`**, **`services/index.ts`** – Consumers of the exported helpers (membership checks, id lists) to gate queries and route decisions.
- **`src/modules/locales/tests/unit/tenants.test.ts`** / **`tenants.fixture.ts`** – Unit tests and fixtures that exercise every export.
- **`scenarios/locales.ts`** – Integration-scenario setup that relies on the same tenant configuration.

## Notes

- **No persistence.** Adding or removing tenants is a deployment-config change (env vars), not a database migration. This is intentional: an admin typo in an import must not be able to create an orphan keyspace.
- **Deduplication is order-sensitive.** If the same id appears in both `NODE_LOCALE_TENANT_FRONTEND` and `NODE_LOCALE_TENANTS_EXTRA`, the first occurrence (default frontend) wins.
- **`extraFrontendTenants` is not exported.** Callers must go through `listTenants()` or `frontendTenantIds()`.
- **Labels are cosmetic.** When a pair omits the label (`mobile` instead of `mobile=Mobile app`), the id itself is used as the label.
- All functions re-read `process.env` on every call, so the list reflects the current environment without a restart or cache invalidation step.
