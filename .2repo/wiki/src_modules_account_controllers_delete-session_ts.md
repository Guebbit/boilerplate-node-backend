# src/modules/account/controllers/delete-session.ts

## Purpose

Thin HTTP adapter for `DELETE /account/sessions/:sessionId`. It extracts the authenticated caller's id and the target session id from the request, delegates the actual revocation to `accountService.sessionRevoke`, and maps the result to a `200` or `404` HTTP response.

## Key elements

- **`deleteSession(request, response)`** — sole export. Reads `authContextOf(request)` for the caller's user id (guaranteed present by upstream `isAuth` middleware) and `request.params.sessionId`. Calls `accountService.sessionRevoke(id, sessionId, callerContextOf(request))`. Responds with `200` + i18n `"account.sessions.revoked"` on success, or `404` + `"account.sessions.not-found"` when `modifiedCount === 0`. Errors are funnelled through `catchAs`.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/modules/account/routes.ts` | Wires the `DELETE /account/sessions/:sessionId` route to `deleteSession` (behind `isAuth`). |
| `src/modules/account/services/index.ts` | Source of `accountService`; this controller calls `sessionRevoke`. |
| `src/infrastructure/http/controller.ts` | Provides `catchAs`, the unified error-to-HTTP mapper. |
| `src/infrastructure/http/request.ts` | Provides `authContextOf` and `callerContextOf` for pulling user id / request metadata. |
| `src/infrastructure/http/response.ts` | Provides `successResponse` / `rejectResponse` helpers. |
| `src/infrastructure/i18n/index.ts` | Provides the `t()` translation function for user-facing messages. |
| `src/infrastructure/i18n/context.ts` | Backing context for the `t()` calls (resolved per-request). |

## Notes

- The service-layer query is filtered to the caller's document **and** `type: refresh`, so a token id belonging to another user, or to a pending reset/verify/delete flow, yields `modifiedCount === 0` → `404` rather than leaking existence.
- Revoking the *current* session is intentional and valid; it is equivalent to `POST /account/logout` except that no cookie is cleared (this endpoint cannot clear another client's cookie anyway).
- Malformed `sessionId` values are rejected with `422` by `toObjectId` inside the service layer — same convention as every other id-taking endpoint.
- The handler uses promise `.then/.catch` rather than `async/await`, consistent with the controller-layer style seen elsewhere.
