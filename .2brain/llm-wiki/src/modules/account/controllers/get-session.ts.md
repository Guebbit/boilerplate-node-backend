---
source: src/modules/account/controllers/get-session.ts
source_sha256: d8d5333fca96b450a51551d58cd7923de04c83f95ee177b2173ea7216dd0c205
context_sha256: 26d1e7b0ac2dbbcad990c42d532ea070df69c04b383dccae1cc3a1317a7eb622
generated_at: 2026-11-22T03:22:26.724998+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/controllers/get-session.ts

## Purpose
Express controller for `GET /account/sessions/:sessionId`. It is a thin HTTP adapter that returns one of the caller's own live sessions by delegating to `accountService.sessionGet`. Someone else's session id, an ended session, an invented id and a malformed id all produce the same 404.

## Key elements
- `getSession(request, response)` is the only export. It does the following:
  - Reads the caller's `id` from `request.authContext!`, which the `isAuth` middleware guarantees.
  - Validates `:sessionId` with `requireId`, using the `account.sessions.not-found` message and the name `sessionId`. If validation fails it returns `Promise.resolve()` and does nothing more, since `requireId` has already handled the response.
  - Calls `accountService.sessionGet(id, sessionId, request)`.
  - If the result is falsy, responds with a 404 via `rejectResponse` and `t('account.sessions.not-found')`.
  - Otherwise responds via `successResponse<Session>`.
  - Wraps the chain in `.catch(catchAs(response, 'getSession'))`.

## Relationships
- `src/infrastructure/http/ids.ts` supplies `requireId`, which validates the path param and sends the not-found response itself on failure.
- `src/infrastructure/http/response.ts` supplies `rejectResponse` and `successResponse`, which build the HTTP replies.
- `src/infrastructure/http/controller.ts` supplies `catchAs`, the shared error handler for rejected promises.
- `src/infrastructure/i18n/index.ts` supplies `t`, which translates the 404 message key. `src/infrastructure/i18n/context.ts` is a related neighbor, but this file does not import it directly.
- `src/modules/account/services/index.ts` supplies `accountService`, whose `sessionGet` method performs the actual lookup.
- `src/types/index.ts` supplies the `Session` type for the response payload.
- `src/modules/account/routes.ts` is the neighbor that wires this handler to the route. The controller does not import it.

## Notes
- The handler returns a Promise (or `Promise.resolve()` on early exit) rather than being `async`.
- It relies on `request.authContext` being set and uses a non-null assertion, so it must only be mounted behind `isAuth`.
- The 404 message key `account.sessions.not-found` is used both for the invalid-id case, through `requireId`, and for the missing-session case.
