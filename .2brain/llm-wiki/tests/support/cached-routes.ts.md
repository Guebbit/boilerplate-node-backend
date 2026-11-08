---
source: tests/support/cached-routes.ts
sha256: 6dd30f81cf5caf36634eab62cee69476b365f44fee3d794908833ac47aeac908
generated_at: 2026-11-08T09:51:41.770616+00:00
model: ollama:qwen3.8:27b
---

# tests/support/cached-routes.ts

## Purpose

Test helper that walks a module's Express router internals and returns the sorted list of GET paths protected by `privateNoCache` or `setCache`, expressed as OpenAPI-style paths. It lives in `tests/` rather than `src/` because it requires the app's modules to already be loaded—placing it in the contract bundler would create a circular boot-order dependency.

## Key elements

- **`cachedReadPaths(mounts)`** *(exported)* — Flat-maps a module's `RouteMount[]` over each layer's route stack, keeping only GET routes whose handler chain includes `privateNoCache` or the `setCache` closure. Returns a sorted array of OpenAPI paths.
- **`Layer`** *(local interface)* — Minimal structural shape of an Express router layer (`route.path`, `route.methods`, `route.stack`). These are undocumented internals; the shape is pinned by `router-internals.test.ts`.
- **`isSetCache(handle)`** *(local)* — Identifies the `setCacheMiddleware` closure (the one `setCache` returns in `cache.ts`) via `Function.name` check.
- **`toOpenApiPath(basePath, routePath)`** *(local)* — Joins base + route, converts `/:param` → `/{param}`, strips a trailing slash.

## Relationships

- **`src/infrastructure/http/middlewares/cache.ts`** — Imports `privateNoCache` directly and detects the `setCache` closure by its declared function name (`setCacheMiddleware`). A rename in `cache.ts` silently breaks the `isSetCache` check.
- **`src/kernel/registry.ts`** — Imports the `RouteMount` type used as the parameter type for `cachedReadPaths`.
- **`tests/cross-cutting/cache-policy-declared.test.ts`** — Consumes `cachedReadPaths` to assert that declared cache-policy annotations match the routes that actually carry the middlewares.

## Notes

- `isSetCache` relies on `Function.name` being `setCacheMiddleware`. This is a string-level coupling to the closure in `cache.ts`; renaming the inner function without updating this file will silently drop `setCache` routes from the result.
- The `Layer` interface mirrors Express's undocumented internal shape. If Express changes its router internals, both this file and `router-internals.test.ts` must be updated together.
- Uses `.toSorted()` (immutable sort), requiring Node ≥ 20.
