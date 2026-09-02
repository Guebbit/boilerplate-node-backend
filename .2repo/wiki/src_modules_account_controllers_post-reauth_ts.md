# src/modules/account/controllers/post-reauth.ts

## Purpose

Thin HTTP adapter for `POST /account/reauth`. Resolves a `401 REAUTH_REQUIRED` challenge (issued by `requireFreshAuth`) by re-verifying the caller's password and re-minting the existing session with a fresh `auth_time`—without terminating it.

## Key elements

- **`postReauth(request, response)`** — The sole export. Validates the body with the `ReauthBody` Zod schema, delegates password verification to `accountService.reauth`, then calls `issueSession` to produce a new token. Tracks outcomes via the `authReauthTotal` Prometheus counter.
- **`issueSession`** (from `../session/session`) — Re-mints the session token after a successful password proof.
- **`authContextOf` / `callerContextOf`** (from `@infrastructure/http/request`) — Extract the authenticated user id and the caller's contextual data (IP, UA, etc.) from the Express request.
- **`rejectValidation`** (from `@infrastructure/http/controller`) — Handles Zod parse failures.
- **`successResponse` / `rejectResponse` / `rejectDatabaseError`** (from `@infrastructure/http/response` & `errors`) — Uniform response writers.
- **`t('account.reauth.success')`** (from `@infrastructure/i18n`) — Localized success message.

## Relationships

- **`routes.ts`** — Registers `postReauth` as the handler for `POST /account/reauth` (behind `isAuth` middleware).
- **`services/index.ts`** — Provides `accountService.reauth(id, password, context)` which performs the actual credential check.
- **`session/session.ts`** — Provides `issueSession(response, id)`, the shared session-minting helper also used by `postLogin` and `postPasswordChange`.
- **`metrics.ts`** — Provides the `authReauthTotal` counter; this controller is its only caller.
- **`infrastructure/http/*`** — Supplies the request/context extractors, response writers, and error helpers used throughout the handler.
- **`infrastructure/i18n/index.ts`** — Supplies the `t` translation function for user-facing messages.
- **`types/index.ts`** — Supplies the `ReauthRequest` type used to type the Express request parameter.

## Notes

- **`issueSession` failure is intentionally swallowed.** After the password check succeeds, a failure to mint the session token still returns `200` (with or without a token) rather than a 500. The rationale (shared with `postPasswordChange`): the caller already answered the step-up prompt correctly, so a 500 would be misleading. The metric is still recorded as `'success'` in both branches.
- **Auth is guaranteed upstream.** The controller assumes `isAuth` middleware has already populated the auth context; it does not re-check.
- **Third caller of `issueSession`.** The file's docblock notes this was the third site (after `postLogin`, `postPasswordChange`) that justified extracting `issueSession` into a shared module.
