---
source: src/infrastructure/http/middlewares/method-not-allowed.ts
sha256: 42536a4dcb68cdd13b62a74cdba878b05aef056f3b6bde8146e395664b224db3
generated_at: 2026-11-14T18:02:45.523681+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/http/middlewares/method-not-allowed.ts

## Purpose

Implements two Express middlewares that enforce HTTP method semantics before or around the routers: a **405 guard** that answers `405 + Allow` (RFC 9110 §15.5.6) when a request hits a known path with a method the contract does not declare, and an **OPTIONS handler** that answers `204 + Allow` (plus `Accept-Patch` when PATCH is available) for every `OPTIONS` request before any router runs. Both derive the allowed-method set from the generated path table and the set of modules this build actually serves.

## Key elements

- **`allowedMethods`** (private) — Given the route table, the served-module set, a request path, and a `literalOnly` flag, returns the sorted list of methods that path supports. Adds `HEAD` whenever `GET` is present and `OPTIONS` whenever any method exists. Returns `[]` when no served path matches.
- **`methodNotAllowed`** (exported) — Factory returning a `RequestHandler`. Accepts `routes`, `served`, and `literalOnly` (default `false`). Passes through when the path is unknown, the method is `OPTIONS`, or the method is allowed; otherwise sets the `Allow` header and calls `rejectResponse(response, 405)`.
- **`answerOptions`** (exported) — Factory returning a `RequestHandler` for `OPTIONS` only. Computes allowed methods (preferring literal templates), sets `Allow` and optionally `Accept-Patch`, and responds `204`. Falls back to a 404 problem when no served module owns the path and the request is neither `OPTIONS *` nor a CORS preflight.
- **`withoutTrailingSlash`** (private) — Strips a single trailing slash; root `/` is unchanged.
- **`patchTypes`** (private) — Looks up the PATCH row for a path via `declaredOperation` and returns its declared media types (empty array when absent).

## Relationships

- **`src/infrastructure/http/response.ts`** — Imports `rejectResponse`, used to send the 405 and the 404 problem body.
- **`src/infrastructure/http/middlewares/content-type.ts`** — Imports `declaredOperation`, used by `patchTypes` to read the same PATCH row the 415 guard uses.
- **`src/app/routes.ts`** — The consumer that mounts both middlewares: `methodNotAllowed` twice (once with `literalOnly=true` before the routers, once with `literalOnly=false` before the 404 catch-all) and `answerOptions` right after `cors`.
- **`src/app/security.ts`** — Part of the broader middleware chain ordering; sits in the same security/contract-enforcement layer.
- **`tests/unit/infrastructure/http/middlewares/method-not-allowed.test.ts`** — Unit tests covering both exports.

## Notes

- **Two mount points, different scope.** The `literalOnly` flag controls whether templated paths (`/products/{id}`) are considered. The pre-router mount uses `literalOnly=true` so `DELETE /products/facets` does not accidentally match `/products/{id}`. The pre-404 mount uses `literalOnly=false` to cover everything else.
- **OPTIONS is exempt from the 405 guard.** `methodNotAllowed` passes `OPTIONS` through unconditionally; `answerOptions` is the sole authority on that method.
- **Unserved modules stay 404.** A path whose owning module is not in the `served` set produces an empty allowed list, so the guard calls `next()` and the 404 catch-all handles it.
- **204 has no `Content-Length`.** The `answerOptions` handler calls `response.status(204).end()` deliberately (RFC 9110 §8.6).
- **Trailing-slash normalisation** is applied inline in both handlers; the root path `/` is special-cased to avoid becoming an empty string.
