# src/infrastructure/http/middlewares/route-flag.ts

## Purpose

A single-purpose Express middleware factory that converts a URL path segment (e.g. a `/hard` suffix) into a value in `request.params`, so that an alternate spelling of the same operation (path segment vs. query param) can be consumed by the same `readInput` / controller entry point without duplicating handler code.

## Key elements

- **`routeFlag(field, value?)`** — Exported middleware factory.
  - `field` (string): the param name to set on `request.params`.
  - `value` (string, defaults to `'true'`): the value to assign.
  - Returns a `RequestHandler` that sets `request.params[field] = value` and calls `next()`.

## Relationships

- **`src/modules/products/routes.ts`** — Uses `routeFlag` to map suffix-style routes (e.g. `DELETE /products/:id/hard`) onto the same controller that handles `DELETE /products/:id?hardDelete=true`.
- **`src/modules/orders/routes.ts`** — Same pattern for order endpoints.
- **`src/modules/users/routes.ts`** — Same pattern for user endpoints.
- **`tests/unit/infrastructure/http/middlewares/route-flag.test.ts`** — Unit tests covering the param-setting behavior and the default value.

## Notes

- Writes to `request.params`, **not** `request.query`. This is intentional: Express 5 exposes `query` via a getter that is not writable, and the path segment is semantically a route param.
- The middleware is intentionally trivial (one assignment + `next()`); its value is in the *position* it occupies in the route chain (after the URL is matched, before the controller runs), not in any logic of its own.
