---
source: src/modules/account/controllers/post-login.ts
sha256: 9dba0101f4f7a0d5e94b5c0d65ed4f4eb4d2efc25d786ea89dc420150582793c
generated_at: 2026-09-23T18:02:32.500400+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/post-login.ts

## Purpose

Controller for `POST /account/login`. Verifies credentials, mints a session (refresh-token cookie + short-lived access token), and emits success/failure observability signals (metrics, audit, analytics). Observability lives here rather than in the service layer so that pre-credential validation failures (e.g. a malformed `remember` value) can be excluded from the login-failure trail, while genuine credential rejections are still recorded.

## Key elements

- **`postLogin`** (exported) — The Express handler. Destructures `email`/`password` from `request.body`, validates the `remember` tier, runs `runTokenCleanup`, delegates to `accountService.login`, then either short-circuits into the 2FA challenge path or calls `issueSession` to set cookies and return an access token. All errors in the promise chain are funneled to `rejectDatabaseError` and intentionally _not_ recorded as login failures.
- **`rememberSchema`** (module-local) — A Zod schema that coerces `request.body.remember` into the `RefreshTokenExpiryTime` enum; rejects unknown tiers with a 422 before any credential work occurs.
- **2FA branch** — If `data.twoFactorEnabledAt` is set, the handler calls `twoFactorService.buildLoginChallenge` and returns a challenge object instead of a session; `postLoginTwoFactor` (not in this file) completes the login.

## Relationships

- **`src/modules/account/routes.ts`** — Registers `postLogin` as the handler for the `POST /account/login` route.
- **`src/modules/account/services/index.ts`** — Re-exports `accountService`, `twoFactorService`, and `runTokenCleanup` used by the controller.
- **`src/modules/account/services/token-cleanup.ts`** — Source of `runTokenCleanup`, invoked before credential verification to expire stale refresh tokens.
- **`src/modules/account/session/session.ts`** — Provides `issueSession`, which sets the refresh-token cookie and returns the access token.
- **`src/modules/account/session/config.ts`** — Source of the `RefreshTokenExpiryTime` enum that constrains the `remember` value.
- **`src/modules/account/session/login-observability.ts`** — Provides `recordLoginSuccess` / `recordLoginFailure` called on the two outcome paths.
- **`src/infrastructure/http/response.ts`** — Provides `successResponse` and `rejectResponse` used for all HTTP replies.
- **`src/infrastructure/http/errors.ts`** — Provides `rejectDatabaseError` for the catch-all error path.
- **`src/infrastructure/http/controller.ts`** — Provides `rejectValidation` for the `remember` 422.
- **`src/kernel/permissions.ts`** — Provides `isUnrestrictedRole`, used to annotate the success observability signal.
- **`src/modules/access/index.ts`** — Re-exports `rolesOf`, used to fetch the user's tenant roles after session issuance.
- **`src/kernel/access/tenant.ts`** — Provides `DEPLOYMENT_TENANT_ID`, the tenant key passed to `rolesOf`.
- **`src/types/index.ts`** — Defines `LoginRequest` and `LoginOutcome` used in the handler signature and response payload.

## Notes

- **Express 5 body semantics:** `request.body` is `undefined` (not `{}`) when no body parser matched the content-type. The `?? {}` guard on the destructure converts that into an empty body so `accountService.login` reaches its own 422 rather than throwing a synchronous `TypeError`. The type signature explicitly types the body as `LoginRequest | undefined` to keep the guard honest.
- **Observability placement is deliberate:** Validation failures for `remember` (422) occur _before_ any `recordLoginFailure` call, so they never pollute the login-failure metric. In contrast, a 422 raised _inside_ `accountService.login` arrives after the failure-recording hook and is still captured.
- **Error semantics in the catch chain:** A database or infrastructure failure after a correct password is _not_ a rejected login. The `.catch` block routes everything to `rejectDatabaseError` without calling `recordLoginFailure`.
- **Roles are fetched post-session:** The user document does not carry its own role; `rolesOf(userId, DEPLOYMENT_TENANT_ID)` is called after `issueSession` resolves to read the membership row fresh.
