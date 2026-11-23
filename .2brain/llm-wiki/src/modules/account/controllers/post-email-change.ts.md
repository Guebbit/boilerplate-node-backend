---
source: src/modules/account/controllers/post-email-change.ts
source_sha256: 9463496202de80d705380cfad9c7cb4ad4cfc0e6fc070cfafb30af12c5062c94
context_sha256: 5a36d0f5e612c268c8035dd95a9951736cde524e1e10917ea8ec46f84b55e766
generated_at: 2026-11-22T03:24:36.213322+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/controllers/post-email-change.ts

## Purpose
Express controller for `POST /account/email-change`. It is a thin HTTP adapter over `accountService.requestEmailChange`: it validates the body, calls the service, and replies with the account view. The mails and pending-change state belong to the service.

## Key elements
- `postEmailChange(request, response)` — the only export. Flow:
  1. Reads `request.authContext!` (non-null asserted).
  2. Validates `request.body` against `RequestEmailChangeBody` with `parseBody`. On failure it returns early, since the helper has already answered (the comment says a missing or malformed address gives a 422).
  3. Calls `accountService.requestEmailChange(authContext.id, parsed.email, callerContextOf(request))`.
  4. If `refused(response, result)` is true, it returns, as the refusal was already written.
  5. Otherwise it calls `answerAsResource(response, result.data, '/account')` and sends `successResponse<AccountView>(response, accountViewOf(result.data, authContext))`.
  6. Rejections go to `catchAs(response, 'postEmailChange')`.

## Relationships
- `src/infrastructure/http/controller.ts` — supplies `parseBody`, `refused` and `catchAs`, which handle validation errors, service refusals and thrown errors.
- `src/infrastructure/http/preconditions.ts` — `answerAsResource` sets resource-style response handling for `/account`. The code comment says it answers as `GET /account` would, with the account's new tag.
- `src/infrastructure/http/request.ts` — `callerContextOf` builds the caller context passed to the service.
- `src/infrastructure/http/response.ts` — `successResponse` writes the success body.
- `src/modules/account/services/index.ts` — provides `accountService`, which does the work.
- `src/modules/account/session/account-view.ts` — `accountViewOf` maps the service result and auth context to the response payload.
- `src/types/index.ts` — provides the `AccountView` type.
- `src/modules/account/routes.ts` — wires this handler to the route. The doc comment says the step-up guard there has already run unconditionally.

## Notes
- This handler does not run the step-up check itself. It relies on the guard in `routes.ts`.
- `request.authContext!` assumes upstream auth middleware has set it.
- The handler returns early without a value on validation failure or refusal. It relies on the helpers having already written the response.
