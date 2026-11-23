---
source: src/modules/account/controllers/get-sessions.ts
source_sha256: 6bec8749074b9fff91aa7e7a83a72ea3d5e575b09865c3cbe855e8b44b95eedd
context_sha256: 2762aeede3e8901f4483dadde9ed0f1d5d261dd9322497b5c7a57d0b67c2b5a7
generated_at: 2026-11-22T03:22:37.106791+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/controllers/get-sessions.ts

## Purpose
Controller for `GET /account/sessions`. It is a thin HTTP adapter that returns the caller's live sessions by delegating to `accountService.sessionsList`.

## Key elements
- `getSessions(request, response)` — the only export. It reads `id` from `request.authContext!` and calls `accountService.sessionsList(id, request)`. On success it sends `{ sessions }` via `successResponse<SessionsResponse>`. On failure it uses `catchAs(response, 'listSessions')`.

## Relationships
- `src/infrastructure/http/response.ts` — supplies `successResponse`, which writes the typed `SessionsResponse` payload.
- `src/infrastructure/http/controller.ts` — supplies `catchAs`, which handles errors from the promise chain. `'listSessions'` is the label passed to it.
- `src/modules/account/services/index.ts` — exports `accountService`. The controller calls its `sessionsList` method.
- `src/types/index.ts` — provides the `SessionsResponse` type, imported through the `@types` alias.
- `src/modules/account/routes.ts` — the route wiring for the account module. It is the expected place where this handler is mounted; the controller file does not reference it.

## Notes
- `request.authContext!` is a non-null assertion. It relies on the `isAuth` middleware having run before this handler.
- The full `request` is passed to the service so it can mark which session is `current`. According to the file's comments, deciding which rows count as sessions and keeping credentials out of the response are handled in `src/modules/account/services/sessions.ts`, not here.
- The handler returns a promise chain rather than using `async/await`.
