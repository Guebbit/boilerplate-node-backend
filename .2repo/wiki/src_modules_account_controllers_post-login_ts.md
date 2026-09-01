# src/modules/account/controllers/post-login.ts

## Purpose

The `POST /account/login` HTTP controller. It authenticates a user's credentials via the account service, then mints the full session (refresh token → cookies → short-lived access token). All observability (metrics, audit, analytics) is emitted here rather than in the service layer, because the success signal must fire only after the tokens and cookies actually exist.

## Key elements

- **`postLogin`** (exported) — The route handler. Reads `email`/`password` raw from the body (no Zod parsing), validates the `remember` tier, runs token cleanup, calls `accountService.login`, and on success creates the refresh token, sets cookies, derives the access token, then responds with `{ token }`.
- **`rememberSchema`** — A Zod schema that validates only the `remember` field against the `RefreshTokenExpiryTime` enum. Parsed *before* the credential check so an invalid tier is rejected with a 422 without touching the secret fields.
- **`recordLoginFailure`** — Increments the `authLoginTotal{status:"failure"}` metric and emits an audit event with `actor_user_id: 'anonymous'`.
- **`recordLoginSuccess`** — Increments `authLoginTotal{status:"success"}`, emits an audit event with the resolved user id/role, and fires a `USER_LOGGED_IN` analytics event.

## Relationships

- **`routes.ts`** — Registers `postLogin` as the handler for `POST /account/login`.
- **`services/index.ts`** — Supplies `accountService.login` (credential check) and `runTokenCleanup` (pre-login housekeeping).
- **`session/jwt.ts`** — `createRefreshToken` and `createAccessToken` produce the JWTs returned/set by this controller.
- **`session/cookies.ts`** — `createRefreshCookie` and `createLoggedCookie` write the session cookies onto the response.
- **`session/config.ts`** — `RefreshTokenExpiryTime` enum constrains the `remember` tier.
- **`@infrastructure/http/response.ts`** — `successResponse` / `rejectResponse` shape every HTTP reply.
- **`@infrastructure/http/errors.ts`** — `rejectDatabaseError` handles unexpected throws (token cleanup, JWT ops, service failures).
- **`@infrastructure/http/controller.ts`** — `rejectValidation` returns the 422 when `remember` is invalid.
- **`@infrastructure/http/request.ts`** — `callerContextOf` extracts request metadata for audit/analytics payloads.
- **`@infrastructure/observability/audit.ts`** / **`audit.ts` (module)** — Generic audit emitter + `accountAuditActions.AUTH_LOGIN` constant.
- **`@infrastructure/observability/analytics/index.ts`** / **`analytics.ts` (module)** — Generic analytics emitter + `accountAnalyticsEvents.USER_LOGGED_IN` constant.
- **`metrics.ts`** — `authLoginTotal` counter.
- **`services/token-cleanup.ts`** — Expired-token sweep executed before each login attempt.

## Notes

- **No Zod on `email`/`password`.** This is a deliberate security choice: validating those fields first would produce a 422 for a too-short password but a 401 for a wrong-but-plausible one, leaking information and skipping the failure audit trail. The stored-hash comparison is the sole decider.
- **`remember` *is* validated with Zod, and first.** An unknown tier would otherwise produce a cookie with no expiry. Because `remember` is not secret, a 422 here reveals nothing about credentials.
- **Success observability fires after all three artifacts exist.** `accountService.login` only proves the credentials matched; the tokens and cookies are minted in the controller.
- **The `.catch` block does NOT call `recordLoginFailure`.** A throw (DB error, JWT failure, cookie write) means the attempt is inconclusive, not a rejected login, so it is routed to `rejectDatabaseError` instead.
- **Promise-chain style** (`.then`/`.catch`) rather than `async`/`await` throughout the handler.
