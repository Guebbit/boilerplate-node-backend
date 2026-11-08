---
source: src/modules/account/controllers/post-session-touch.ts
sha256: a7510e6e08c645c3bda6e9033432080fb32f77d944183dc4925122907641fa9d
generated_at: 2026-11-08T04:07:35.643642+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/post-session-touch.ts

## Purpose

Handler for `POST /account/sessions/current/touch`. It does **not** write anything — the auth middleware has already counted the request as activity. It simply reads the session's current activity clock from the authenticated context and returns it, so a client can display a "still there?" prompt from server-side numbers.

## Key elements

- **`postSessionTouch(request, response)`** — The sole export. Resolves a no-op promise, calls `activityOf(request.authContext!)` to extract the current `SessionActivity`, and sends it back via `successResponse` with status 200. Errors are funneled through `catchAs`.

## Relationships

- **`@infrastructure/http/response`** — `successResponse` wraps the `SessionActivity` payload in the standard success envelope.
- **`@infrastructure/http/controller`** — `catchAs` provides the uniform error-catch → error-response mapping for this handler.
- **`../session/account-view`** — `activityOf` reads the activity fields (last-active timestamp, idle duration, etc.) from the auth context object.
- **`../routes`** — Registers `postSessionTouch` as the terminal handler for the `POST /account/sessions/current/touch` route.
- **`@types`** — Supplies the `SessionActivity` type used as the response payload.

## Notes

- Despite the route name saying "touch," this handler performs **no write**. The JSDoc is explicit: `getAuth` has already marked the session active before the controller runs, so the only work left is to read and echo back the clock state.
- The `Promise.resolve().then(…)` idiom (rather than `async/await`) is the convention for these controllers so that `catchAs` can intercept synchronous throws as well.
- `request.authContext!` is asserted non-null; the route is expected to sit behind the `getAuth` guard, so the auth context is always present at this point.
