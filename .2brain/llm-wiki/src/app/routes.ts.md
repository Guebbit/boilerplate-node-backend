---
source: src/app/routes.ts
sha256: f3a49038c42eef4ad0a6650d928404d291ca0be21edc09c4adade6b3bc7fec43
generated_at: 2026-09-23T17:35:52.522878+00:00
model: ollama:qwen3.8:27b
---

# src/app/routes.ts

## Purpose

Central route-mounting step for the Express app. It walks the registry of enabled modules, mounts each at the `basePath` declared in that module's own manifest, mounts the non-domain system routes, and closes with a 404 catch-all. The file is deliberately domain-agnostic: it knows no business-domain names and imports only the one non-domain router (`system-routes`).

## Key elements

- **`installRoutes(app: Express): void`** (the sole export)
    - Iterates `enabledModules`; for each entry where both `basePath` and `routes` are present, calls `app.use(basePath, routes)`. Modules that own a collection but no URL (e.g. `audit-logs`) are silently skipped.
    - Mounts `systemRoutes` at `/` (serves the API contract, docs, and root redirect).
    - Registers a final middleware that calls `rejectResponse(response, 404)` for any unmatched request.

## Relationships

- **`src/modules.ts`** — provides `enabledModules`, the array of manifests this function iterates.
- **`src/app/system-routes.ts`** — provides the `router` (re-exported as `systemRoutes`) for non-domain endpoints.
- **`src/infrastructure/http/response.ts`** — provides `rejectResponse`, used by the 404 handler.
- **`src/app.ts`** — calls `installRoutes(app)` during app bootstrap.
- **`tests/integration/app/demo-routes.test.ts`** — integration test that exercises the mounted routes end-to-end.
- **`package.json`** — supplies the `express` types imported here.

## Notes

- The 404 catch-all lives _here_, not in the error-handling layer, because it must be the last route registered. Placing it elsewhere would risk a later `app.use` call being shadowed and unreachable.
- The guard `if (basePath && routes)` is intentional: a manifest with one but not the other is treated as a no-op, not an error.
- Only `system-routes` is imported by name. All domain routers arrive through the `enabledModules` array, keeping this file decoupled from individual modules.
