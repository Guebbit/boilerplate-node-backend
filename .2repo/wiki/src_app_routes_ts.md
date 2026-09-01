# src/app/routes.ts

## Purpose

Single-entry-point function that mounts all domain routers (driven by module manifests) plus the non-domain system routes and a 404 catch-all onto an Express app. It exists so that adding a new domain never requires touching this file—modules self-declare their `basePath` and router.

## Key elements

- **`installRoutes(app: Express): void`** — the sole export. Iterates `enabledModules`, calls `app.use(basePath, routes)` for each entry that has both a `basePath` and a `routes` router. Then mounts `systemRoutes` at `/`. Finally registers a 404 handler that calls `rejectResponse(response, 404)`.

## Relationships

- **`src/modules.ts`** — source of `enabledModules`; this file is a consumer, not a producer, of that list.
- **`src/app/system-routes.ts`** — imported as `router`; mounted at `/` *after* all domain routes so domain paths take precedence.
- **`src/infrastructure/http/response.ts`** — provides `rejectResponse`, the only function from that module used here (in the 404 handler).
- **`src/app.ts`** — expected caller of `installRoutes`; this file has no knowledge of when or where it is invoked.
- **`package.json`** — declares the `express` dependency whose types (`Express`, `Request`, `Response`) are imported here.

## Notes

- The 404 catch-all is deliberately co-located here (not in an error-handling module) because it must be the *last* route registered. Extracting it to a separate `install*` call would let a later `app.use` slip in behind it and become unreachable.
- A module whose manifest has `basePath` but no `routes` (or vice-versa) is silently skipped, not treated as an error. Example: `audit-logs` owns a collection but exposes no URL.
- `system-routes` is the one *explicit* import in this file. Every other router arrives via the `enabledModules` array; `system-routes` is imported directly because it is not a domain and therefore not part of that array.
