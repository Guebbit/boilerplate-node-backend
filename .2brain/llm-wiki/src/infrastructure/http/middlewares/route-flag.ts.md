---
source: src/infrastructure/http/middlewares/route-flag.ts
sha256: a8facbad4c8ed47b73c57f77db44f2a562826080e542531cf2032dd660e8ba47
generated_at: 2026-09-23T17:44:53.527506+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/http/middlewares/route-flag.ts

## Purpose

Middleware factory that lets a URL path segment (e.g. the `/hard` suffix in `DELETE /products/:id/hard`) be read by `readInput` exactly like a named route param, so a single controller entry point can serve two different spellings of the same operation.

## Key elements

- **`routeFlag(field, value?)`** — Factory returning an Express `RequestHandler`. When mounted on a route, it writes `value` (default `'true'`) into `request.params[field]` and calls `next()`. The `field` name is chosen by the caller to match whatever key `readInput` expects.

## Relationships

- **`src/modules/orders/routes.ts`**, **`src/modules/products/routes.ts`**, **`src/modules/users/routes.ts`** — Consumers that mount `routeFlag` on routes which use a path-segment spelling (e.g. `/hard`) rather than a query-string spelling, allowing both to hit the same controller.
- **`tests/unit/infrastructure/http/middlewares/route-flag.test.ts`** — Unit tests covering the param-assignment behavior.

## Notes

- Writes to `request.params`, **not** `request.query`. Express 5 exposes `query` via a non-writable getter, so assignment there would silently no-op.
- The middleware does not inspect the actual path string; the caller is responsible for wiring it to the correct position in the route definition (e.g. `app.delete('/products/:id/hard', routeFlag('hardDelete'), controller)`).
- Default `value` is the string `'true'`, not the boolean. Downstream `readInput` parsing is responsible for any type coercion.
