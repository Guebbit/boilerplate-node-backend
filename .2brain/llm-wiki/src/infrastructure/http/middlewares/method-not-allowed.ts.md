---
source: src/infrastructure/http/middlewares/method-not-allowed.ts
sha256: 6f4cda157a98116e948ef1be7e54eb1c58bd4355cd46e12a2ba32d46809af66d
generated_at: 2026-11-08T03:31:37.164253+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/http/middlewares/method-not-allowed.ts

## Purpose

Express middleware that returns **405 + `Allow`** (per RFC 9110 §15.5.6) when a request targets a path the API contract defines but with a method that path does not support. It prevents these requests from falling through to the catch-all 404, which would be semantically wrong.

## Key elements

- **`methodNotAllowed(routes, served, literalOnly?)`** – exported factory that returns an Express `RequestHandler`. Accepts the generated path table (`OperationRoute[]`), the set of module names this build actually mounts, and an optional `literalOnly` flag. The returned handler either calls `next()` or responds 405 with an `Allow` header.
- **`allowedMethods(routes, served, path, literalOnly)`** – internal helper that computes the sorted set of HTTP methods a given path template permits, filtered to served modules only. Automatically adds `HEAD` when `GET` is present (Express routes HEAD through the GET handler).

## Relationships

- **`src/app/routes.ts`** – caller. Mounts `methodNotAllowed` twice: once with `literalOnly: true` before the parameterised routers (so `DELETE /products/facets` is judged before it could match `/products/{id}`), and once with the default `literalOnly: false` immediately before the 404 catch-all for all remaining requests.
- **`src/infrastructure/http/response.ts`** – provides `rejectResponse`, which this middleware calls to send the 405 body.
- **`tests/unit/infrastructure/http/middlewares/method-not-allowed.test.ts`** – unit tests for the guard's method matching, `Allow` header construction, and pass-through conditions.

## Notes

- **`OPTIONS` is never rejected.** The CORS preflight layer answers before any route runs, and a bare `OPTIONS` is not treated as a contract omission.
- **Trailing-slash normalisation:** the handler strips a single trailing slash from `request.path` before matching, but only when the path is longer than one character (so `/` is left as-is).
- **`literalOnly` matters for ordering.** When `true`, only templates with `parameterCount === 0` are considered, ensuring a literal path like `/products/facets` is judged before it could be shadowed by `/products/{id}`.
- **Undelivered modules stay 404.** If a path belongs to a module not in the `served` set, `allowedMethods` returns an empty array and the middleware calls `next()`, letting the 404 fire.
- **`OperationRoute` comes from `@api/operation-routes`** (a generated path table), not hand-written. The `module` field on each route is nullable (`null` means framework-level).
