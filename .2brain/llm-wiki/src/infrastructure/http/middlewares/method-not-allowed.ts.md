---
source: src/infrastructure/http/middlewares/method-not-allowed.ts
sha256: 6f4cda157a98116e948ef1be7e54eb1c58bd4355cd46e12a2ba32d46809af66d
generated_at: 2026-10-29T02:03:27.085107+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/http/middlewares/method-not-allowed.ts

## Purpose

Express middleware that distinguishes a 405 (known path, wrong method) from the catch-all 404. It inspects the request against the generated OpenAPI path table and, when the path is served but the method is not, responds `405` with an `Allow` header per RFC 9110 §15.5.6. Without it, every wrong-method request would fall through to the 404.

## Key elements

- **`allowedMethods(routes, served, path, literalOnly)`** *(private)* — Filters the generated `OperationRoute[]` table for entries whose module is mounted, whose template (literal-only or not) matches the path, and whose `pattern` regex matches. Collects the union of methods, adds `HEAD` whenever `GET` is present, and returns a sorted array.
- **`methodNotAllowed(routes, served, literalOnly?)`** *(exported)* — Factory returning an Express `RequestHandler`. Strips a trailing slash, calls `allowedMethods`, and either passes through (`next()`) or sets the `Allow` header and calls `rejectResponse(response, 405)`. Passes through when no served path matches (so the 404 catch-all still fires) or when the method is `OPTIONS`.

## Relationships

- **`src/app/routes.ts`** — The mount site. The doc comment describes two invocations: one with `literalOnly = true` placed before the routers (so `DELETE /products/facets` is judged against the literal template before `/products/{id}` can swallow it), and one with `literalOnly = false` immediately before the 404 catch-all (where only unmatched requests arrive).
- **`src/infrastructure/http/response.ts`** — Supplies `rejectResponse`, the shared helper that writes the error body and status; this middleware calls it with `405`.
- **`tests/unit/infrastructure/http/middlewares/method-not-allowed.test.ts`** — Unit tests covering the factory's pass-through and 405 branches, `Allow` header content, and the `literalOnly` filtering.

## Notes

- **Two mounts, different scopes.** The `literalOnly` flag is the only difference between the two instances. The pre-router mount only sees paths with zero `{param}` so it never pre-empts a legitimate templated route; the post-router mount sees everything the routers declined.
- **`OPTIONS` is never judged.** CORS preflight is handled upstream, and a bare `OPTIONS` is not a method the contract would omit.
- **Unservable modules stay 404.** If a route's `module` is not in the `served` set, the path is treated as unknown, so the 404 catch-all responds — the module simply isn't in this build.
- **`HEAD` is implicit.** It is not expected in the generated table; the middleware adds it whenever `GET` is allowed, mirroring Express's own behavior.
