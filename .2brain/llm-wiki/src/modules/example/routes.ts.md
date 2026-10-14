---
source: src/modules/example/routes.ts
sha256: abdb04e1ba9e5de0e701f7ebc8695a3ac58ddd07557fd2c692368ba5f6e7fa20
generated_at: 2026-10-14T15:44:34.647815+00:00
model: ollama:qwen3.8:27b
---

# src/modules/example/routes.ts

## Purpose
Express route table for the example module. Declares public vs. private endpoints by their positional placement relative to a single `isAuth` guard, wires per-route permission, cache, rate-limit, and upload middleware, then delegates to the module's controllers.

## Key elements
- **`router` (export)** — the Express `Router` instance; the sole export of this file.
- **Public segment** — `GET /published/:id` is mounted *above* the auth guard; anonymous callers are permitted.
- **Auth boundary** — `router.use(getAuth, isAuth)`; every route below this line requires a signed-in session.
- **Permission checks** — `requirePermission('examples.self.{read|create|update|delete}')` on each private route.
- **Cache headers** — `privateNoCache` on GETs, `noStore` on `POST /search`.
- **Rate limiters** — `createExampleLimiter` (module-specific, before `POST /`) and `uploadLimiter` (infrastructure, before `PUT /:id/cover`).
- **Upload middleware** — `upload.image()` precedes the cover controller.
- **Controllers** — imported and mounted as terminal handlers for each CRUD action and the cover upload.

## Relationships
- **Controllers** (`get-example`, `get-examples`, `post-example`, `update-example`, `delete-example`, `put-example-cover`) — imported as route handlers; this file controls ordering and the middleware chain that precedes each.
- **`rate-limits.ts`** — provides `createExampleLimiter`, a module-specific limiter (distinct from the shared `uploadLimiter`).
- **`module.ts`** — the module registration point that mounts this `router` on the application.
- **`@kernel/middlewares/authorizations`** — supplies `getAuth`, `isAuth`, `requirePermission`.
- **`@infrastructure/http/middlewares/cache`** — supplies `noStore` / `privateNoCache`.
- **`@infrastructure/http/middlewares/rate-limit`** — supplies the shared `uploadLimiter`.
- **`@infrastructure/http/middlewares/upload`** — supplies `upload.image()` for multipart parsing.
- **`tests/unit/routes.test.ts`** — unit-tests route ordering, middleware chains, and permission assignments.

## Notes
- **Positional auth is the only mechanism.** A route's public/private status is determined solely by whether it appears before or after `router.use(getAuth, isAuth)`. There is no per-route exemption flag.
- **Route order is load-bearing.** `POST /search` must precede `GET /:id` so the literal token "search" is not captured as an `:id` parameter.
- **`isAuth` chosen over `isAuthOrCredential` deliberately.** The `examples.self.*` permissions narrow by *who* is asking; an API key resolves to no session to narrow by, so credential-based access is excluded.
- **Limiter-before-write convention.** Both `createExampleLimiter` and `uploadLimiter` are placed before the controller (and before `upload.image()`) so a rate-limited rejection never triggers a DB write or file write.
- **Cache semantics are intentional.** `privateNoCache` on GETs (browser may store but must revalidate, since the payload depends on the caller) vs. `noStore` on `POST /search` (one-shot computation, never cached).
