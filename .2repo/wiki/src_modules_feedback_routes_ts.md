# src/modules/feedback/routes.ts

## Purpose

Defines the Express route table for the feedback module: one public contact-form endpoint for visitors and a set of admin-only read/update endpoints for operators. It wires each route to its controller and attaches cache / authorization middleware in the correct order.

## Key elements

- **`router`** (exported) — the Express `Router` instance that `module.ts` mounts into the app.
- **`POST /contact`** — public contact-form handler; runs `invalidateCache(['feedback'])` before delegating to `postFeedbackContact`.
- **`router.use(getAuth, isAuth, isAdmin)`** — positional admin guard; applies to every route declared *below* this line only.
- **`POST /search`** — admin search; cached 600 s under the shared key `feedback:search` via `setCache`, using `searchFeedbackKeyParameters` to build the key. Delegates to `getFeedback`.
- **`GET /`** — admin list/search; same 600 s cache and same `feedback:search` key as `POST /search` so either spelling warms the other. Delegates to `getFeedback`.
- **`PUT /:id`** — admin status update; runs `invalidateCache(['feedback'])` before delegating to `putFeedbackStatus`.

## Relationships

- **`src/infrastructure/http/middlewares/cache.ts`** — provides `setCache` (wraps `POST /search` and `GET /`) and `invalidateCache` (wraps `POST /contact` and `PUT /:id`).
- **`src/kernel/middlewares/authorizations.ts`** — provides `getAuth`, `isAuth`, `isAdmin`, applied as a positional middleware stack above all admin routes.
- **`src/modules/feedback/controllers/get-feedback.ts`** — source of the `getFeedback` handler and the `searchFeedbackKeyParameters` array that feeds the cache key.
- **`src/modules/feedback/controllers/post-feedback-contact.ts`** — source of the `postFeedbackContact` handler.
- **`src/modules/feedback/controllers/put-feedback-status.ts`** — source of the `putFeedbackStatus` handler.
- **`src/modules/feedback/module.ts`** — consumes the exported `router` to mount these endpoints into the application.

## Notes

- The `router.use(getAuth, isAuth, isAdmin)` line is **positional**: it guards only routes declared after it. The single public route (`POST /contact`) must remain above that line; moving it below would silently expose an admin route publicly. The code comments and `tests/cross-cutting/authenticated-controllers.test.ts` exist to catch this.
- `POST /search` is mounted **before** any `/:id`-shaped route to prevent a future parameterized route from matching the literal string "search" as an id.
- `POST /search` and `GET /` share the identical Redis cache key (`feedback:search`) and 600 s TTL. The wire-level response still carries `no-store`; the caching is a Redis arrangement, not a browser-cacheable POST.
- `searchFeedbackKeyParameters` is imported from the controller and passed to `setCache` so the cache key reflects the relevant query parameters, not the (undefined-semantics) POST body.
