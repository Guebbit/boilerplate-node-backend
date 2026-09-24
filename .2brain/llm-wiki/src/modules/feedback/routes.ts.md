---
source: src/modules/feedback/routes.ts
sha256: 99478c9ddb9e0dfba29f00945e146612783b5d6b42dfe681f50db544c9834ffe
generated_at: 2026-09-23T18:41:01.087769+00:00
model: ollama:qwen3.8:27b
---

# src/modules/feedback/routes.ts

## Purpose

Defines the Express route table for the feedback/contact module: one public visitor-submission endpoint (`POST /contact`) and a set of admin-only routes for reading, searching, updating, and deleting submitted feedback. The file's central structural concern is that auth is enforced **positionally** — a single `router.use` gate splits the router into a public half (above) and an admin half (below).

## Key elements

- **`router`** (exported) — the Express `Router` instance consumed by the module.
- **`POST /contact`** — the sole public route. Middleware chain: `contactLimiters` → `humanChallengeGate` → `idempotencyKey` → `invalidateCache(['feedback'])` → `postFeedbackContact`.
- **`router.use(getAuth, isAuthOrCredential)`** — the positional auth gate. Every route declared below this line requires an authenticated operator with a `feedback.any.*` credential; the public route above is unaffected.
- **`cacheFeedbackSearch`** (local const) — `searchCache('feedback', searchFeedbackKeyParameters, 600)` shared by both `POST /search` and `GET /` so either warms the other's Redis entry.
- **`POST /search`** — admin read with filters carried in the request body (GET has no defined body semantics). Requires `feedback.any.read`.
- **`GET /`** — admin list-all. Requires `feedback.any.read`.
- **`PUT /:id`** — update feedback status. Requires `feedback.any.update`; invalidates the `feedback` cache key.
- **`DELETE /:id`** — remove a feedback entry. Requires `feedback.any.delete`; invalidates the `feedback` cache key.

## Relationships

- **Controllers** (`./controllers/post-feedback-contact`, `./controllers/get-feedback`, `./controllers/put-feedback-status`, `./controllers/delete-feedback`) — each handler is mounted as the terminal middleware on its route.
- **`rate-limits.ts`** — supplies `contactLimiters` (three-dimension budget: address, submitted email, address block) applied before any write.
- **`@infrastructure/http/middlewares/human-challenge`** — `humanChallengeGate` runs before the DB write; off unless `NODE_ANTIBOT_PROVIDER` is set.
- **`@infrastructure/http/middlewares/idempotency`** — `idempotencyKey` deduplicates repeat submissions on `POST /contact`.
- **`@infrastructure/http/middlewares/cache`** — `searchCache` (read path) and `invalidateCache` (mutation path) manage the shared `feedback` Redis key.
- **`@kernel/middlewares/authorizations`** — `getAuth`, `isAuthOrCredential` (positional gate), and `requirePermission` (per-route key check).
- **`./module.ts`** — consumes the exported `router` to wire it into the application.
- **`./tests/unit/routes.test.ts`** — unit-tests route registration and middleware ordering.
- **`tests/support/routed-modules.ts`** — imports this router for cross-cutting integration tests (e.g., `authenticated-controllers.test.ts`).

## Notes

- **Auth is positional, not per-route.** A route accidentally appended above the `router.use` line becomes public with no compile-time error. The cross-cutting test `tests/cross-cutting/authenticated-controllers.test.ts` is the safety net.
- **`POST /search` exists to carry filter parameters in a body.** It shares its cache key (`feedback:search`) with `GET /`; responses are `no-store` to browsers (the cache is Redis-side only).
- **`invalidateCache` is applied to all three mutation routes** (`POST /contact`, `PUT /:id`, `DELETE /:id`), not just the admin ones.
- **Rate limiters deliberately include successful posts** (not just failures) because the abuse pattern for this form is repeated successful submissions.
