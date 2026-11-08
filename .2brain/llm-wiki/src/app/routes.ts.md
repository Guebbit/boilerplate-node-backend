---
source: src/app/routes.ts
sha256: 3128b8c4dcb98240e780d9e9efccf7459d4a924afef1869ad0c15f178ce2986d
generated_at: 2026-11-08T03:13:44.815716+00:00
model: ollama:qwen3.8:27b
---

# src/app/routes.ts

## Purpose

Central route-installation function for the Express app. It wires up a default cache-control header, registers 405 guards, mounts every enabled domain module at its self-declared base path, attaches the two cross-cutting routers (system ping, config), and closes with a 404 catch-all — all in one ordered pass so no later mount can slip behind the terminal handlers.

## Key elements

- **`installRoutes(app: Express): void`** (exported) — the sole export; called once during app bootstrap to attach all routing logic.
  - Sets `Cache-Control: no-store` on every response by default; individual routes opt out via `setCache` or `privateNoCache`.
  - Runs `methodNotAllowed(OPERATION_ROUTES, servedModules, true)` **before** module mounting so literal contract paths (e.g. `DELETE /products/facets`) are caught before parameterised handlers.
  - Iterates `enabledModules[].mounts[]` and calls `app.use(basePath, routes)` for each entry; modules with no `mounts` are silently skipped.
  - Mounts `systemRoutes` and `configRoutes` at `/`.
  - Runs a second `methodNotAllowed` pass (without the `true` flag) for paths that matched a module's base but used an undeclared method.
  - Registers a terminal 404 handler using `rejectResponse(response, 404)`.

## Relationships

- **`src/app.ts`** — calls `installRoutes(app)` as part of application assembly.
- **`src/app/system-routes.ts`** — provides the root ping router, mounted at `/`.
- **`src/app/config-routes.ts`** — provides `GET /config`, mounted at `/`.
- **`src/modules.ts`** — supplies the `enabledModules` array; this file reads each module's `mounts` (basePath + router) to decide what to register.
- **`src/infrastructure/http/middlewares/method-not-allowed.ts`** — the 405 + `Allow` middleware applied twice (pre- and post-mount).
- **`src/infrastructure/http/response.ts`** — provides `rejectResponse` used by the 404 handler.
- **`tests/integration/scenarios/demo-routes.test.ts`** — integration tests that exercise the mounted routes end-to-end.
- **`package.json`** — declares the `express` dependency and the `@infrastructure/*` / `@api/*` path aliases used by the imports.

## Notes

- The 404 handler lives here (not in the generic error-handler module) intentionally: it must be the **last** registered route, and co-locating it with the mounts guarantees no subsequent mount can override it.
- The `no-store` header is set here rather than in `installSecurity` because `installStatic` runs between the two and would otherwise strip its year-long `Cache-Control` from static assets.
- A module entry in `enabledModules` with an empty or missing `mounts` array is skipped without error — this is the expected pattern for data-only modules (e.g. `access`) that expose no direct URL.
- `OPERATION_ROUTES` (from `@api/operation-routes`) is the source of truth for which literal paths exist in the contract; the `methodNotAllowed` middleware consults it to build the `Allow` header.
