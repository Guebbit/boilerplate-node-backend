---
source: src/modules/account/controllers/post-session-touch.ts
source_sha256: a7510e6e08c645c3bda6e9033432080fb32f77d944183dc4925122907641fa9d
context_sha256: 7b33e8d0f3f2d65b3bb918a7da66d5110961e77a572ed7ef1b4d3ee19ed8d97b
generated_at: 2026-11-22T03:27:09.906673+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/controllers/post-session-touch.ts

## Purpose
Express controller for `POST /account/sessions/current/touch`. It counts the caller's session as active and returns its idle clock, so a client can show a "still there?" prompt based on server-side numbers.

## Key elements
- `postSessionTouch(request, response)` — the only export. It wraps the work in a promise chain and responds with `successResponse<SessionActivity>(response, activityOf(request.authContext!), 200)`. Errors are routed to `catchAs(response, 'postSessionTouch')`.

## Relationships
- `src/infrastructure/http/response.ts` — supplies `successResponse`, which sends the 200 payload.
- `src/infrastructure/http/controller.ts` — supplies `catchAs`, the error handler tagged with the controller name.
- `src/modules/account/session/account-view.ts` — supplies `activityOf`, which turns the auth context into the activity data that is returned.
- `src/types/index.ts` — supplies the `SessionActivity` type used as the response payload type (imported through the `@types` alias).
- `src/modules/account/routes.ts` — the neighbor most likely to mount this handler on the route. That wiring is not visible in this file.

## Notes
- The controller writes nothing. The `getAuth` step, which runs before it, already counts the request as activity because the route is not marked passive. The handler only reports the clock as it now stands.
- It relies on `request.authContext` being populated by that earlier step. The non-null assertion (`!`) means a missing context would throw, and `catchAs` would handle the error.
