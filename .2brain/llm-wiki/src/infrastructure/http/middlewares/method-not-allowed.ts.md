---
source: src/infrastructure/http/middlewares/method-not-allowed.ts
source_sha256: 7d3bd546bcc5e2c8fc3f9b2222deb7a73520f9d6757c2c0097729b29d2dea117
context_sha256: 5bcbbddb55786f97c00670f8c6a6365324711a7eebe096dc4e19c9e1c4600ef0
generated_at: 2026-11-22T02:50:58.111084+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/http/middlewares/method-not-allowed.ts

## Purpose
Implements the HTTP 405 guard and the `OPTIONS` answer. A path the contract knows, requested with a method it doesn't declare, gets `405` + `Allow` (RFC 9110 §15.5.6) instead of the catch-all's 404. Paths of modules this build doesn't serve stay 404.

## Key elements
- `allowedMethods(routes, served, path, shadowedOnly)` (internal): the single place `Allow` is computed. It collects the methods of every served route whose pattern matches the path, adds `HEAD` when `GET` is present, and adds `OPTIONS` when any method exists. It returns a sorted array, empty when nothing matches. With `shadowedOnly`, it counts only the templates with the fewest `{param}`, and only when a more specific template shadows another.
- `methodNotAllowed(routes, served, shadowedOnly = false)`: middleware factory. It strips a trailing slash and computes the allowed methods. It calls `next()` if the set is empty, the request is `OPTIONS`, or the method is allowed. Otherwise it sets `Allow` and calls `rejectResponse(response, 405)`.
- `answerOptions(routes, served, contentTypes)`: middleware factory that answers every `OPTIONS` request and passes other methods on.
  - Served path: 204 + `Allow`, plus `Accept-Patch` when `Allow` includes `PATCH`.
  - `OPTIONS *` or a CORS preflight (`Access-Control-Request-Method`): 204.
  - Plain `OPTIONS` on a path no served module owns: 404 via `rejectResponse`.
  - It tries the literal (most specific) templates first and falls back to all matches.
- `withoutTrailingSlash(path)` (internal): strips one trailing slash; the root `/` is kept.
- `patchTypes(contentTypes, path)` (internal): the declared PATCH media types for a path, read via `declaredOperation`. It returns an empty array when no PATCH row matches.

## Relationships
- `src/infrastructure/http/response.ts`: provides `rejectResponse`, which produces the 405 and 404 problem responses.
- `src/infrastructure/http/middlewares/content-type.ts`: provides `declaredOperation`, the same lookup the 415 guard uses, reused here for `Accept-Patch`.
- `src/app/routes.ts` / `src/app/security.ts`: the app wiring that mounts these middlewares. The file doc describes two mounts for `methodNotAllowed`: before the routers with `shadowedOnly = true`, and right before the 404 catch-all. `answerOptions` is mounted right after `cors`. The exact split between the two app files isn't visible here.
- `tests/unit/infrastructure/http/middlewares/method-not-allowed.test.ts`: unit tests for this file.
- Types `OperationRoute` (`@api/operation-routes`) and `RequestContentType` (`@api/request-content-types`) describe the generated path and request-body tables passed in.

## Notes
- `OPTIONS` is never judged by `methodNotAllowed`, because `answerOptions` handles it earlier.
- Shadowing rule: the template with fewer `{param}` wins, so `/a/{id}/sync` shadows `/a/{id}/{other}`. A match with zero params always counts. This is why the early mount exists: `DELETE /products/facets` must not reach `/products/{id}`.
- `answerOptions` relies on `cors` running with `preflightContinue: true`, so every `OPTIONS` reaches it.
- The 204 is sent with `end()`, so it carries no body and no `Content-Length` (RFC 9110 §8.6).
- The trailing-slash stripping is written twice, inline in `methodNotAllowed` and as `withoutTrailingSlash`.
