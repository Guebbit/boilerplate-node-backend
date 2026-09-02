# src/modules/feedback/routes.ts

## Purpose

Express route table for the feedback/contact module. Defines one public endpoint (visitor contact form) and a set of admin-only endpoints for reading, updating, and deleting feedback submissions. The critical architectural constraint is positional: the single public route is mounted *above* a `router.use(getAuth, isAuth, isAdmin)` gate, so any route added below that line is automatically admin-only.

## Key elements

- **`router`** (exported) — the Express `Router` instance, mounted by the module.
- **`POST /contact`** — sole public route. Chain: `submissionLimiter` → `invalidateCache(['feedback'])` → `postFeedbackContact`.
- **`router.use(getAuth, isAuth, isAdmin)`** — positional auth gate; every route below it requires an authenticated admin.
- **`cacheFeedbackSearch`** — a `searchCache('feedback', searchFeedbackKeyParameters, 600)` instance shared by both read routes.
- **`POST /search`** — admin filter/search endpoint (POST body carries filters that GET can't; shares cache key with `GET /`).
- **`GET /`** — admin list-all endpoint; shares the same cache key as `POST /search`.
- **`PUT /:id`** — admin status update; invalidates the feedback cache before delegating to `putFeedbackStatus`.
- **`DELETE /:id`** — admin delete; invalidates the feedback cache before delegating to `deleteFeedback`.

## Relationships

- **`@kernel/middlewares/authorizations`** — supplies `getAuth`, `isAuth`, `isAdmin`; applied via `router.use` to gate all admin routes.
- **`@infrastructure/http/middlewares/rate-limit`** — supplies `submissionLimiter`, applied only to `POST /contact`.
- **`@infrastructure/http/middlewares/cache`** — supplies `searchCache` (read-path caching) and `invalidateCache` (write-path invalidation) used across routes.
- **`./controllers/post-feedback-contact`**, **`./controllers/get-feedback`**, **`./controllers/put-feedback-status`**, **`./controllers/delete-feedback`** — terminal handlers for each route; `get-feedback` also exports `searchFeedbackKeyParameters` used to build the cache key.
- **`./module.ts`** — consumes the exported `router` to register the module with the application.
- **`tests/cross-cutting/authenticated-controllers.test.ts`** — asserts admin routes are reachable only by authenticated admins (catches a route accidentally placed above the gate).
- **`tests/cross-cutting/write-routes-are-guarded.test.ts`** — asserts all write (POST/PUT/DELETE) routes pass through the auth chain.
- **`./tests/unit/routes.test.ts`** — unit tests for route registration and middleware ordering.

## Notes

- **Positional auth is the invariant.** A new public route must be inserted *above* the `router.use(getAuth, …)` line; a new admin route goes below. There is no per-route auth annotation.
- **`POST /search` vs `GET /`** exist side-by-side because a GET body is semantically undefined and the cache layer keys on query parameters only. Both share the cache key `feedback:search`; hitting either warms the other.
- **`submissionLimiter` ≠ credential limiters.** It budgets *successful* form submissions (spam), not failed auth attempts. See `docs/tools/security.md#the-rate-limit-budgets`.
- **Write routes call `invalidateCache(['feedback'])`** before the handler runs, so the 600 s search cache is bust on every mutation.
- **`POST /search` is Redis-side caching only** — the wire response is `no-store`; it is not a browser-cacheable POST.
