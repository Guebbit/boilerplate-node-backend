# src/modules/feedback/routes.ts

## Purpose

Defines the Express route table for the feedback/contact module. It exposes one public visitor route (the contact form) and a set of admin-only routes for reading and updating submitted feedback. The single positional auth gate (`router.use`) separates the two halves.

## Key elements

- **`router`** (exported) — The Express `Router` instance registered by the module. Contains all feedback/contact endpoints.
- **`POST /contact`** — Public; calls `invalidateCache(['feedback'])` then `postFeedbackContact`. The only route above the auth gate.
- **`POST /search`** — Admin; runs `cacheFeedbackSearch` then `getFeedback`. Exists because a GET body has no defined semantics; carries filters via request body.
- **`GET /`** — Admin; shares the same `cacheFeedbackSearch` middleware as `POST /search`, so either warms the other's cache entry.
- **`PUT /:id`** — Admin; calls `invalidateCache(['feedback'])` then `putFeedbackStatus`.
- **`cacheFeedbackSearch`** — Local const wrapping `searchCache('feedback', searchFeedbackKeyParameters, 600)` with key `feedback:search`. TTL is 600 s.

## Relationships

- **`@kernel/middlewares/authorizations`** — Supplies `getAuth`, `isAuth`, `isAdmin`; applied as a single `router.use` gate that protects every route defined after it.
- **`@infrastructure/http/middlewares/cache`** — Supplies `invalidateCache` (used by the two write routes) and `searchCache` (used by the two read routes).
- **`./controllers/post-feedback-contact`** — Terminal handler for `POST /contact`.
- **`./controllers/get-feedback`** — Terminal handler for both `GET /` and `POST /search`; also exports `searchFeedbackKeyParameters` which defines the cache-key shape.
- **`./controllers/put-feedback-status`** — Terminal handler for `PUT /:id`.
- **`module.ts`** — Consumes the exported `router` to mount it in the application.
- **`tests/cross-cutting/authenticated-controllers.test.ts`** — Asserts that any route reading the caller sits below the auth gate; catches a public route accidentally placed after `router.use`.
- **`tests/cross-cutting/write-routes-are-guarded.test.ts`** — Asserts write routes (`POST`, `PUT`) are behind authentication.
- **`tests/unit/routes.test.ts`** — Unit-level route-table tests for this file.

## Notes

- **Positional auth gate.** The `router.use(getAuth, isAuth, isAdmin)` line guards only routes defined *below* it. Adding a new public route requires inserting it *above* that line; appending it at the bottom makes it admin-only silently.
- **Shared cache key.** `GET /` and `POST /search` both use the same `searchCache` instance (`feedback:search`), so a request to either warms the other's entry. The `POST /search` response is still `no-store` at the HTTP level — the cache is Redis-side only.
- **Route order within the admin half.** `POST /search` is declared before `GET /` so its literal path can't be swallowed by a future `/:id` GET pattern.
