---
source: src/modules/account/controllers/post-reauth.ts
sha256: 74f2ac1df2e8794246ab2cf4309a5027168d90edb877bd34b72ca98691d4d04d
generated_at: 2026-09-23T18:03:23.442328+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/post-reauth.ts

## Purpose

Thin Express handler for `POST /account/reauth`. It re-proves the caller's password (responding to a `401 REAUTH_REQUIRED` step-up challenge issued by `requireFreshAuth`) and re-mints the existing session with a fresh `auth_time`, without terminating it.

## Key elements

- **`postReauth`** (exported) — The sole handler. Validates the body against the `ReauthBody` zod schema, calls `accountService.reauth`, then calls `issueSession` to re-mint the session. Emits `authReauthTotal` metric on every path (success, validation failure, service failure, or error).

## Relationships

- **`src/modules/account/services/index.ts`** — Calls `accountService.reauth(id, password, callerContext)` to perform the actual password verification.
- **`src/modules/account/session/session.ts`** — Calls `issueSession(response, id)` to re-mint the session token with a new `auth_time`. This is the same tail shared with `postLogin` and `postPasswordChange`.
- **`src/modules/account/metrics.ts`** — Increments `authReauthTotal` with `{ status: 'success' | 'failure' }` on every code path.
- **`src/infrastructure/http/controller.ts`** — Uses `rejectValidation` to return a 400 when the zod parse fails.
- **`src/infrastructure/http/errors.ts`** — Uses `rejectDatabaseError` in the `.catch` to map unexpected errors to a 500.
- **`src/infrastructure/http/response.ts`** — Uses `successResponse` / `rejectResponse` for the final HTTP reply.
- **`src/infrastructure/http/request.ts`** — Extracts caller context via `callerContextOf(request)` and reads `request.authContext` (set upstream by auth middleware).
- **`src/infrastructure/i18n/index.ts`** — Calls `t('account.reauth.success')` for the i18n success message.
- **`src/types/index.ts`** — Uses `ReauthRequest` (typed body) and `AuthTokens` (success payload shape).
- **`src/modules/account/routes.ts`** — Consumes `postReauth` to wire the `POST /account/reauth` route.

## Notes

- The handler does **not** write any durable state itself; `accountService.reauth` only compares the password. All session re-minting is delegated to `issueSession`.
- A failed `issueSession` call intentionally falls through to the outer `.catch` (500) rather than returning a 200 with no token — a 200 would falsely signal that the step-up challenge was cleared.
- Auth context (`request.authContext`) is guaranteed by the `isAuth` middleware; the `!` non-null assertion is safe in this context.
- `ReauthBody` is imported from `@api/schemas.zod` (not listed as a graph neighbor), not from the account module.
