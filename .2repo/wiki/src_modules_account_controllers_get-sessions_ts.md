# src/modules/account/controllers/get-sessions.ts

## Purpose

Thin Express controller for `GET /account/sessions`. It extracts the authenticated user ID and the current refresh-token cookie, then delegates to `accountService.sessionsList` to return the caller's live refresh tokens as a session list. All token semantics (which types count as a session, hiding raw token values, marking the current session) live in the service layer.

## Key elements

- **`getSessions(request, response)`** — The sole export. Reads `authContextOf(request)` for the user ID, pulls the `jwt` cookie from `request.cookies`, calls `accountService.sessionsList(id, cookieToken)`, and writes the response via `successResponse` or lets `refused` short-circuit on a non-success result. Errors are funneled through `catchAs(response, 'getSessions')`.

## Relationships

- **`src/modules/account/routes.ts`** — Registers `getSessions` at the `GET /account/sessions` route (behind `isAuth` middleware).
- **`src/modules/account/services/index.ts`** — Exports `accountService`; this controller calls its `sessionsList` method, the only business logic step.
- **`src/infrastructure/http/controller.ts`** — Supplies the `catchAs` (error → standard error response) and `refused` (service-level refusal → early return) helpers.
- **`src/infrastructure/http/request.ts`** — Supplies `authContextOf`, which reads the pre-validated auth payload off the Express request.
- **`src/infrastructure/http/response.ts`** — Supplies `successResponse` for the standard success envelope.

## Notes

- Auth is guaranteed upstream by `isAuth` middleware; this file never validates credentials.
- The `jwt` cookie is read only to pass down so the service can flag the caller's *current* session. The controller does not parse or validate it.
- Token-type filtering and value-redaction are explicitly the service's job (see `services/tokens.ts`), not this adapter's.
- The cookie is accessed via a `Record<string, string | undefined>` cast on `request.cookies`, so the token may be `undefined` if the cookie is absent — the service must handle that case.
