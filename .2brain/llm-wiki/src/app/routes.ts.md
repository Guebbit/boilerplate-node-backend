---
source: src/app/routes.ts
sha256: 174705fa426a47541d7de584c3bde0fce0ee2b6a1fa5df57868135f64e8105ab
generated_at: 2026-10-29T01:50:52.911161+00:00
model: ollama:qwen3.8:27b
---

# src/app/routes.ts

## Purpose

Single install step that wires every enabled module's router onto the Express app, plus the cross-cutting HTTP concerns that must sit in a specific order: the default `Cache-Control` header, the 405/`Allow` guards (before and after the mounts), and the 404 catch-all. It deliberately knows no domain names—each module declares its own `basePath` and router in its manifest.

## Key elements

- **`installRoutes(app: Express): void`** — the sole export. Runs the following in order:
  1. Sets `Cache-Control: no-store` as a bare `setHeader` (not the `noStore` middleware, so `setCache`/`privateNoCache` can overwrite it per-route without tripping the mark-check).
  2. First `methodNotAllowed` pass (strict mode: literal contract paths only, no `{param}`).
  3. Iterates `enabledModules → mounts` and calls `app.use(basePath, routes)` for each pair; modules with an empty `mounts` array are simply skipped.
  4. Mounts `systemRoutes` (root ping) at `/`.
  5. Second `methodNotAllowed` pass (non-strict: all contract paths including params).
  6. 404 catch-all via `rejectResponse(response, 404)`.

## Relationships

- **`src/app.ts`** — caller; invokes `installRoutes` during app bootstrap.
- **`src/modules.ts`** — provides `enabledModules`; this file reads each module's `mounts` array (basePath + router) to decide what to attach.
- **`src/app/system-routes.ts`** — imported as `./system-routes`; the only explicitly imported domain-agnostic router (serves the root health-check).
- **`src/infrastructure/http/middlewares/method-not-allowed.ts`** — called twice (before and after the mounts) with `OPERATION_ROUTES` and the set of served module names.
- **`src/infrastructure/http/response.ts`** — `rejectResponse` powers the 404 body.
- **`tests/integration/scenarios/demo-routes.test.ts`** — integration suite that exercises the mounted routes end-to-end.

## Notes

- The 404 handler lives here, **not** in the error-handling install, because it must be the last-registered route. Splitting it out would risk a later mount registering behind it and never being reached.
- `Cache-Control: no-store` is set as a raw header here rather than via the `noStore` middleware because `installStatic` runs between the two installs and would strip the year-long cache from static assets. Per-route `setCache` / `privateNoCache` simply overwrite this default.
- A module with no `mounts` (e.g. `access`) is silently skipped, not an error—it owns data but exposes no URLs of its own.
- The first `methodNotAllowed` call uses `true` (strict) so only literal paths (no `{param}`) are matched pre-mount; the second call omits the flag to cover the full contract post-mount.
