# src/modules/locales/tenants.ts

## Purpose

Defines the set of tenants (keyspaces) a deployment of the translation service supports. Tenants are pure **configuration** read from environment variables at call time — they are never stored in the database, so a typo in an import cannot silently create an orphan keyspace. The file also exposes the predicates and lookups other modules need to validate or enumerate tenants.

## Key elements

- **`backendTenant()`** — Returns the id of the API's own tenant from `NODE_LOCALE_TENANT_BACKEND` (default `'demo-be'`).
- **`frontendTenant()`** — Returns the id of the default frontend tenant from `NODE_LOCALE_TENANT_FRONTEND` (default `'demo-fe'`). Used as the fallback when a client omits a tenant.
- **`listTenants()`** *(exported)* — Assembles the full ordered list (`LocaleTenantDescriptor[]`): backend first, then the default frontend, then any extras parsed from `NODE_LOCALE_TENANTS_EXTRA` (comma-separated `id=Label` pairs). De-duplicates by id; first spelling wins.
- **`frontendTenantIds()`** *(exported)* — Returns only the frontend tenant ids, used by `entryCount` and the messages route to know which dictionaries may be served.
- **`isKnownTenant(id)`** *(exported)* — Boolean check: does this id appear anywhere in `listTenants()`?
- **`isFrontendTenant(id)`** *(exported)* — Boolean check: is this id specifically a frontend tenant (i.e., its dictionary is servable)?
- **`extraFrontendTenants()`** *(internal)* — Parses `NODE_LOCALE_TENANTS_EXTRA` into `LocaleTenantDescriptor[]`; label defaults to id when omitted.

## Relationships

- **`src/types/index.ts`** — Imports `LocaleTenantKind`, `LocaleTenant`, and `LocaleTenantDescriptor`; all return types in this file reference these types.
- **`src/modules/locales/demo.ts`** — Consumes `listTenants` / `isKnownTenant` to seed or validate demo data against the active tenant set.
- **`src/modules/locales/repository.ts`** — Uses `frontendTenantIds()` to scope queries (e.g., `entryCount`) to servable tenants only.
- **`src/modules/locales/services/languages.ts`** — Calls `listTenants()` to enumerate tenants per language.
- **`src/modules/locales/services/messages.ts`** — Guards route handlers with `isFrontendTenant` before serving a dictionary.
- **`src/modules/locales/services/capabilities.ts`** — References the tenant list when reporting what the deployment supports.
- **`src/modules/locales/tests/unit/tenants.fixture.ts`** — Supplies env-var fixtures so unit tests can assert on each export.
- **`src/modules/locales/tests/unit/tenants.test.ts`** — Exercises every exported function against controlled environment values.

## Notes

- All tenant ids are resolved **at call time** from `process.env`, not captured at module load. This means tests must set the env var before invoking a function, and hot-reloading env vars (e.g., in a REPL) changes behavior immediately.
- `extraFrontendTenants` splits on `,` then `=`; a value like `mobile=Mobile app` keeps the space in the label. A bare token (`kiosk`) yields label = id.
- De-duplication in `listTenants` uses a `Set` and the side-effectful `(seen.add(id), true)` pattern — if you refactor, preserve first-wins semantics.
- The `backend` tenant is intentionally **not** servable via the messages route; only `kind === LocaleTenantKind.frontend` entries are.
- The `GET /locales/tenants` endpoint is backed by `listTenants()`, so its response shape is exactly `LocaleTenantDescriptor[]`.
