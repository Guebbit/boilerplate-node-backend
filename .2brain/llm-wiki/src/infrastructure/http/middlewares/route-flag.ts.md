---
source: src/infrastructure/http/middlewares/route-flag.ts
source_sha256: a8facbad4c8ed47b73c57f77db44f2a562826080e542531cf2032dd660e8ba47
context_sha256: 6eed5dc0474c88c69f7f54a398931993d177b953b53920f850ed9aa8a1b54d7d
generated_at: 2026-11-22T02:52:12.863082+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/http/middlewares/route-flag.ts

## Purpose
Provides an Express middleware factory that turns a route-level detail spelled in the URL (e.g. a `/hard` suffix) into a route param. `readInput` can then read it like any other param, so two spellings of the same operation (`DELETE /products/:id/hard` and `DELETE /products/:id?hardDelete=true`) share one controller entry point.

## Key elements
- `routeFlag(field, value = 'true')`: returns a `RequestHandler` that sets `request.params[field] = value` and calls `next()`. The `_response` argument is unused.

## Relationships
- `src/modules/orders/routes.ts`, `src/modules/products/routes.ts` and `src/modules/users/routes.ts` are the route modules in the dependency graph that use this middleware. They attach it to routes so a path suffix such as `/hard` supplies a param to the controller.
- `tests/unit/infrastructure/http/middlewares/route-flag.test.ts` is the unit test for this middleware.
- `readInput` is the consumer of the injected param. It is referenced in the file's comments but not imported here.

## Notes
- It writes to `request.params`, not `request.query`. Express 5 exposes `query` through a getter that isn't writable, and the path segment is genuinely a route param.
- The default `value` is the string `'true'`, not a boolean. Params are strings.
