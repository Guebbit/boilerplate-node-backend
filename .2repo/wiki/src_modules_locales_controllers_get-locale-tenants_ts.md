# src/modules/locales/controllers/get-locale-tenants.ts

## Purpose

Express controller for `GET /locales/tenants`. Returns the list of tenant keyspaces this deployment accepts for locale entries, so an admin UI or client can discover valid tenant IDs without hardcoding them. Sourced from deployment configuration rather than a database.

## Key elements

- **`getLocaleTenants`** (exported) — Synchronous arrow-function handler. Calls `localeService.listTenants()` and wraps the result in `{ tenants: [...] }` via `successResponse`. The `Request` param is unused (prefixed `_`).

## Relationships

- **`src/infrastructure/http/response.ts`** — Imports `successResponse` to produce the standard HTTP success envelope.
- **`src/modules/locales/routes.ts`** — Registers this handler for the `GET /locales/tenants` path.
- **`src/modules/locales/services/index.ts`** — Imports `localeService` and calls its `listTenants()` method; the service is the single abstraction layer over where the tenant list actually lives.

## Notes

- The controller intentionally never references `process.env` or the `../tenants` config module. The service owns the "where does this list come from" decision, so the source can change without touching the controller.
- Despite requiring no database access, the call still routes through `localeService` for consistency with every other locale read.
- Public and cacheable: no auth check, no user-specific data — identical response for all callers.
