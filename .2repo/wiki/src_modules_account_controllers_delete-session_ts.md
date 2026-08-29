# src/modules/account/controllers/delete-session.ts

## Purpose

Controller for `DELETE /account/sessions/:sessionId` — revokes a single refresh-token session belonging to the authenticated caller ("log out that device"). It exists to let a user terminate any of their own sessions from the account management UI without affecting the current cookie-based session.

## Key elements

- **`deleteSession`** (exported) — The sole handler. Reads the caller's user id via `authContextOf`, extracts `sessionId` from route params, calls `accountService.sessionRevoke`, then branches on `modifiedCount`:
  - `0` → `404` with `t('account.sessions.not-found')`
  - `> 0` → `200` with `t('account.sessions.revoked')`
  - Exception → delegated to `catchAs(response, 'deleteSession')`

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/modules/account/routes.ts` | Registers this handler on the `DELETE /account/sessions/:sessionId` route. |
| `src/modules/account/services/index.ts` | Provides `accountService.sessionRevoke(id, sessionId, callerCtx)` which performs the actual DB update. |
| `src/infrastructure/http/request.ts` | `authContextOf` extracts the authenticated user id; `callerContextOf` packages IP/user-agent metadata passed to the service. |
| `src/infrastructure/http/response.ts` | `successResponse` / `rejectResponse` shape the JSON envelopes. |
| `src/infrastructure/http/controller.ts` | `catchAs` is the uniform error-to-HTTP mapping used in the `.catch` branch. |
| `src/infrastructure/i18n/index.ts` | `t()` localizes the success/not-found messages. |

## Notes

- **Auth is pre-ensured** by an upstream `isAuth` middleware; the controller does not check tokens itself.
- **Cross-user / wrong-type ids return 404, not 403.** The repository filters on both the caller's document and `type: 'refresh'`, so a foreign id or a pending reset/verify token id simply matches zero rows.
- **Malformed ids return 422.** `toObjectId` throws inside the service; `catchAs` maps that to a 422. This keeps the 404/422 split consistent with every other id-taking endpoint.
- **Revoking the current session is explicitly allowed.** Unlike `POST /account/logout`, this endpoint does not clear the `Set-Cookie` header; the current client's next refresh attempt will simply fail.
