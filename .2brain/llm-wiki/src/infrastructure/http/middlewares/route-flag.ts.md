---
source: src/infrastructure/http/middlewares/route-flag.ts
sha256: a8facbad4c8ed47b73c57f77db44f2a562826080e542531cf2032dd660e8ba47
generated_at: 2026-11-08T03:32:50.822522+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/http/middlewares/route-flag.ts

## Purpose

Factory for an Express middleware that injects a synthetic value into `request.params` so a route-level URL detail (e.g. a `/hard` path suffix) is readable by `readInput` the same way a query-string param would be. This lets a module express one operation in two URL spellings without duplicating controller logic.

## Key elements

- **`routeFlag(field: string, value?: string)`** — Returns an Express `RequestHandler`. When applied to a route, it writes `value` (defaults to `'true'`) into `request.params[field]` before calling `next()`. The target `field` name and the injected `value` are both supplied by the caller.

## Relationships

- **`src/modules/orders/routes.ts`, `src/modules/products/routes.ts`, `src/modules/users/routes.ts`** — These route definitions import and apply `routeFlag` to give path-segment "flags" (e.g. `DELETE /:id/hard`) a value their shared `readInput` helper can consume alongside query-string variants.
- **`tests/unit/infrastructure/http/middlewares/route-flag.test.ts`** — Unit tests verifying that the middleware writes the expected `field`/`value` pair onto `request.params` and calls `next()`.

## Notes

- Writes to `request.params` deliberately, not `request.query`. In Express 5, `req.query` is exposed via a non-writable getter, so mutating it silently fails. The path segment *is* a route param semantically, making `params` the correct target.
- The middleware is stateless and order-sensitive: it must be registered **after** Express has parsed the path params for the route but **before** the controller runs, or the injected field won't be visible to `readInput`.
