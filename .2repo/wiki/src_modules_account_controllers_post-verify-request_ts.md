# src/modules/account/controllers/post-verify-request.ts

## Purpose

Thin HTTP adapter for `POST /account/verify-request`. It re-sends the email verification link for a user whose original signup email never arrived. All business logic (including which account states are eligible for re-verification) lives in the service layer; this file only extracts auth context, delegates, and shapes the HTTP response.

## Key elements

- **`postVerifyRequest`** (exported) — Express handler for `POST /account/verify-request`. Reads the authenticated user's `id` from the request, calls `accountService.requestEmailVerificationFor(id, callerContextOf(request))`, then either writes a refusal or a success response. Errors are funnelled through `catchAs`.
- **`refused(response, result)`** — imported guard; short-circuits the handler with an appropriate HTTP status when the service rejects the request.
- **`successResponse(response, undefined, result.status, result.message)`** — standard success envelope with the service's status code and message.
- **`catchAs(response, 'postVerifyRequest')`** — imported error-catch helper that serialises unexpected throws into a consistent error response.

## Relationships

- **`src/infrastructure/http/controller.ts`** — provides `catchAs` and `refused`, the two control-flow helpers this handler uses for error/rejection paths.
- **`src/infrastructure/http/request.ts`** — provides `authContextOf` (extracts authenticated user id) and `callerContextOf` (extracts caller metadata passed to the service).
- **`src/infrastructure/http/response.ts`** — provides `successResponse`, the canonical success-response writer.
- **`src/modules/account/routes.ts`** — registers `postVerifyRequest` on the `POST /account/verify-request` route (presumably behind the `isAuth` middleware).
- **`src/modules/account/services/index.ts`** — re-exports `accountService`, whose `requestEmailVerificationFor` method contains all verification-state logic and the actual email-sending side effect.

## Notes

- Authentication is **not** checked here; the `isAuth` middleware upstream guarantees a valid `authContextOf`. Do not add auth logic in this file.
- The service, not the controller, decides which account states are eligible for re-verification. A caller cannot bypass that check by calling this endpoint.
- The handler uses a promise chain (`.then`/`.catch`) rather than `async/await`, consistent with the surrounding codebase's controller style.
