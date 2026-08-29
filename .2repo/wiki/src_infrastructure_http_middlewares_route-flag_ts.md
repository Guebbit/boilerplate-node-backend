# src/infrastructure/http/middlewares/route-flag.ts

## Purpose

A factory for an Express middleware that injects a fixed value into `request.params` under a named key. It exists so that literal path segments (e.g. `DELETE /products/:id/hard`) can be treated as declared boolean inputs by `readInput`, giving controllers a single input-declaration surface instead of special-casing path vs. query flags.

## Key elements

- **`routeFlag(field, value = 'true'): RequestHandler`** – Returns an Express middleware that, on invocation, assigns `value` (a string) to `request.params[field]` and calls `next()`. The caller supplies the param name and an optional literal value.

## Relationships

- **`src/modules/orders/routes.ts`, `src/modules/products/routes.ts`, `src/modules/users/routes.ts`** – These route modules use `routeFlag` as inline middleware on routes that carry a flag in the path (e.g. a `:hard` or `:soft` segment), so the controller's `readInput` declaration covers both the path form and an equivalent query-param form.
- **`tests/unit/infrastructure/http/middlewares/route-flag.test.ts`** – Unit-tests that the middleware sets the expected key/value on `request.params` and calls `next()`.

## Notes

- Writes to `request.params`, not `request.query`, because Express 5 exposes `query` via a read-only getter. It also matches the semantic intent: the value *is* a route param, just spelled as a literal so that `/products/{id}/false` is impossible at the URL level.
- The value is always a string at this layer; boolean coercion happens downstream in `readInput`.
- The factory pattern (outer function returns a handler) is what lets a route declare the flag name inline without repeating middleware logic.
