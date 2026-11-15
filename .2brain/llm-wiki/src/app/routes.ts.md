---
source: src/app/routes.ts
sha256: 4a9ea1fbc5dbd990e469059b5ef7b7df93a4865823aedf635e65193deb28920a
generated_at: 2026-11-14T17:49:17.009935+00:00
model: ollama:qwen3.8:27b
---

# src/app/routes.ts

## Purpose

Central route-mounting install for the Express app. It walks `enabledModules` to attach each module's router at its self-declared `basePath`, mounts the two app-level routers (`system-routes`, `config-routes`), and registers the 404 catch-all — all without referencing any specific domain name.

## Key elements

- **`installRoutes(app: Express): void`** — the sole export. Configures, in order:
  - A `Cache-Control: no-store` default header (overridable per-route via `setCache` / `privateNoCache`).
  - `methodNotAllowed(OPERATION_ROUTES, servedModuleNames, true)` — a pre-router 405 for literal contract paths (no `{param}`), so they don't fall into a parametric handler.
  - Module routers: iterates `enabledModules[].mounts[]`, calling `app.use(basePath, routes)`. Modules with no `mounts` are silently skipped.
  - `systemRoutes` and `configRoutes` mounted at `'/'`.
  - `methodNotAllowed(OPERATION_ROUTES, servedModuleNames)` — post-router 405 for any remaining contract path.
  - Inline 404 handler calling `rejectResponse(response, 404)`.

## Relationships

- **`src/app.ts`** — calls `installRoutes` during app setup (upstream caller).
- **`src/modules.ts`** — provides `enabledModules` (each carrying `mounts: { basePath, routes }[]`) and `servedModuleNames` (list passed to `methodNotAllowed`).
- **`src/app/system-routes.ts`** — imports its `router` export; mounted at `'/'`.
- **`src/app/config-routes.ts`** — imports its `router` export; mounted at `'/'`.
- **`src/infrastructure/http/middlewares/method-not-allowed.ts`** — imported as `methodNotAllowed`; used twice (pre- and post-router).
- **`src/infrastructure/http/response.ts`** — imported as `rejectResponse`; used by the 404 handler.
- **`tests/integration/scenarios/demo-routes.test.ts`** — integration-test suite that exercises the mounted routes end-to-end.
- **`package.json`** — declares `express` and workspace packages that supply the type imports.

## Notes

- The 404 is deliberately registered *inside* `installRoutes` (not in a separate security/error install) because it must be the **last** route; splitting it out would allow a later `app.use` to shadow it.
- The `no-store` header is set here (not in `installSecurity`) because `installStatic` runs between the two and would otherwise strip the long-lived `Cache-Control` it sets on assets.
- A module whose manifest has no `mounts` array is skipped, not treated as an error — e.g. an `access` module that only owns data and exposes no URLs of its own.
- `methodNotAllowed` is called twice: the first pass (with `literalOnly = true`) catches exact-match contract paths before parametric routes can intercept them; the second pass catches anything remaining after all routers have been tried.
