---
source: src/app/routes.ts
source_sha256: 1c1d625213ff93770d837539b9b7053e29b0864d53485be730ad7f7b69877e23
context_sha256: c5c6db321ce5e44f39b5444b4dc00e5f5a979d8013382bdff02b1737fb8b4018
generated_at: 2026-11-22T02:31:10.972570+00:00
model: claude-code:claude-sonnet-5-5
---

# src/app/routes.ts

## Purpose
Mounts all HTTP routes on the Express app. Modules mount themselves: each declares a `basePath` and router in its manifest, and this file walks `enabledModules` without knowing any domain names. Only two routers are imported explicitly (the root ping and `GET /config`), since they belong to no module.

## Key elements
- `installRoutes(app: Express): void` – the only export. It registers, in order:
  1. A middleware setting `Cache-Control: no-store` on every response by default.
  2. `methodNotAllowed(OPERATION_ROUTES, servedModuleNames, true)`, which returns 405 + `Allow` for contract paths that a more specific template shadows.
  3. Each enabled module's `mounts` (`basePath` + `routes`).
  4. `systemRoutes` and `configRoutes` at `/`.
  5. A second `methodNotAllowed(OPERATION_ROUTES, servedModuleNames)`, which returns 405 + `Allow` for a known contract path asked with another method.
  6. A 404 catch-all calling `rejectResponse(response, 404)`.

## Relationships
- `src/modules.ts` – supplies `enabledModules` (iterated for `mounts`) and `servedModuleNames` (the modules this build treats as known paths).
- `src/app/system-routes.ts` and `src/app/config-routes.ts` – each exports a `router` that is mounted at `/`.
- `src/infrastructure/http/middlewares/method-not-allowed.ts` – provides `methodNotAllowed`, used twice.
- `src/infrastructure/http/response.ts` – provides `rejectResponse`, used for the 404.
- `@api/operation-routes` – provides `OPERATION_ROUTES`, the contract route table passed to `methodNotAllowed`.
- `src/app.ts` – the app setup, which presumably calls `installRoutes`. The call itself is not visible in this file.
- `tests/integration/scenarios/demo-routes.test.ts` – an integration test related to this file in the graph.
- `package.json` – a graph neighbor. No direct interaction is visible in this file.

## Notes
- **Order matters.** The 404 catch-all must be registered last, so it lives here rather than in error handling. Otherwise a later mount could end up behind it and never be reached.
- **`no-store` is the default.** It is set here rather than in `installSecurity` because `installStatic` runs between the two, and setting it earlier would strip the long cache from static images. It uses the bare header rather than the `noStore` middleware. That middleware marks the response, and `setCache` refuses a route carrying the mark. Routes that cache (`setCache`, `privateNoCache`) overwrite the header.
- **The first `methodNotAllowed` runs before the routers.** Without it, a request to a path like `/products/facets` with an undeclared method would reach the templated handler and return 404, where the contract matches the more specific path first.
- **Modules without mounts are skipped.** For example, `access` has no URL of its own. A mount carries `basePath` and `routes` together, because a router without a mount point serves nothing.
