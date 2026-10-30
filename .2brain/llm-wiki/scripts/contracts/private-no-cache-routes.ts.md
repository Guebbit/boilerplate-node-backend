---
source: scripts/contracts/private-no-cache-routes.ts
sha256: 86fd85a8250d4d579219672aec90d17b8498101fd2fc54e5fe7614e6d0653274
generated_at: 2026-10-29T01:31:57.018769+00:00
model: ollama:qwen3.8:27b
---

# scripts/contracts/private-no-cache-routes.ts

## Purpose

Standalone build-time script that walks the mounted Express routers and prints every GET route that uses `privateNoCache` or `setCache` as an OpenAPI path. It runs as a child process (spawned by `openapi-bundle.ts`) so the bundler can collect these routes without importing the full application runtime into a build step.

## Key elements

- **`ROUTES_MARKER`** (`'PRIVATE_NO_CACHE_ROUTES='`) – the stdout prefix the parent process greps for to extract the JSON array. The same literal is spelled in `openapi-bundle.ts`.
- **`Layer`** (interface) – the minimal slice of Express router internals (`route.path`, `route.methods`, `route.stack[].handle`) this walk depends on.
- **`isSetCache(handle)`** – identifies the `setCacheMiddleware` closure (the only return value of `setCache` in `cache.ts`) by checking `Function.name`.
- **`toOpenApiPath(basePath, routePath)`** – joins the base and route path, converts `/:id` → `/{id}`, strips a trailing slash.
- **`paths`** (const) – flatMaps `enabledModules` → `mounts` → `routes.stack`, keeping only GET routes whose stack contains `privateNoCache` or a `setCache` handle.
- **Exit behaviour** – writes `\n<MARKER><sorted JSON>\n` to stdout, then `process.exit(0)`.

## Relationships

- **`src/infrastructure/http/middlewares/cache.ts`** – imports `privateNoCache` for identity comparison against route handlers; the `isSetCache` helper looks for the closure that `setCache` in the same file returns.
- **`src/modules.ts`** – imports `enabledModules` to obtain the list of mounted routers (each with `basePath` and `routes`) to walk.

## Notes

- **Express internals dependency:** The `Layer` shape is undocumented Express internal structure. A contract test (`router-internals.test.ts`) pins it; an Express upgrade that changes the router stack shape will break this script.
- **Fragile name check:** `isSetCache` relies on the closure being named exactly `setCacheMiddleware`. Renaming that closure in `cache.ts` silently stops the script from detecting `setCache` routes.
- **Shared stdout channel:** The application's own logger also writes to stdout. The parent (`openapi-bundle.ts`) must parse only the line matching `ROUTES_MARKER`; any other output is ignored or could corrupt the result if interleaved.
- **String duplication:** `ROUTES_MARKER` is defined here *and* in `openapi-bundle.ts`. They must stay in sync manually.
