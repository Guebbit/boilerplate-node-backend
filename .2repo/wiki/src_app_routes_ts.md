# src/app/routes.ts

## Purpose

Single-entry route installer for the Express app. It walks the list of enabled modules, mounts each one's router at its self-declared `basePath`, then mounts the non-domain `system-routes` router and a 404 catch-all. Because it drives mounting entirely from the module registry, no domain name is hard-coded here.

## Key elements

- **`installRoutes(app: Express): void`** – The only export. Iterates `enabledModules`, mounts any module that has a `routes` property at its `basePath`, mounts `systemRoutes` at `/`, and finally registers a catch-all that calls `rejectResponse(response, 404)`.
- **404 catch-all** – Inline middleware (not a named export). Deliberately lives here rather than in the error-handling install so it is guaranteed to be the last route registered.

## Relationships

- **`src/modules.ts`** – Source of `enabledModules`; this file is the consumer that decides which of those entries actually receive a URL.
- **`src/app/system-routes.ts`** – Imported as `router`; mounted at `/` for the contract, docs, and root redirect (non-domain routes).
- **`src/infrastructure/http/response.ts`** – Provides `rejectResponse`, used by the 404 handler.
- **`src/app.ts`** – Upstream caller that invokes `installRoutes(app)` during app bootstrap (the function's `@param` doc confirms it expects the full Express app).

## Notes

- A module whose manifest has no `routes` is silently skipped, not treated as an error (e.g. `audit-logs` owns a collection but no URL). The manifest types treat "no router" as a valid whole, so there is no partial state to guard against.
- The 404 handler must remain the last `app.use` call in `installRoutes`. Moving it to a separate install risks a later mount being registered after it and becoming unreachable.
- `systemRoutes` is the one explicit import into this otherwise domain-agnostic walk; everything else is data-driven via `enabledModules`.
