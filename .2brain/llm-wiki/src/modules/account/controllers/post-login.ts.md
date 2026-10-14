---
source: src/modules/account/controllers/post-login.ts
sha256: 430319c14dd273c718fafb77f9d126cde4e8b40e2c720074dea50e0402116576
generated_at: 2026-10-14T14:36:25.527456+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/post-login.ts

## Purpose

Controller for `POST /account/login`. Receives credentials, delegates to the account service, then mints the full session (refresh-token cookies + short-lived access token). Emits success/failure observability, audit, and analytics at this layer rather than in the service, so that validation-failure paths and post-credential-check errors are recorded consistently.

## Key elements

- **`postLogin`** (exported) — Express handler. Validates the `remember`/`transport` tier with Zod *before* calling the service (unknown tiers must 422 rather than become cookies with no lifetime). On success: issues the session via `issueSession`, checks the caller's role via `isUnrestrictedCaller`, records the login, and marks the browser as a remembered device. On 2FA: returns a challenge (no cookies, no access token) for `postLoginTwoFactor` to complete.
- **`rememberSchema`** (module-local) — Zod schema for the optional `remember` (enum from `RefreshTokenExpiryTime`) and `transport` (enum from `SESSION_TRANSPORTS`) fields.

## Relationships

- **`src/modules/account/services/index.ts`** — calls `accountService.login(email, password)` for credential verification and `twoFactorService.buildLoginChallenge` for the 2FA branch.
- **`src/modules/account/session/session.ts`** — calls `issueSession` to mint the refresh token, set cookies, and return the access token.
- **`src/modules/account/session/config.ts`** — imports `RefreshTokenExpiryTime` to constrain the `remember` enum.
- **`src/modules/account/session/strategy.ts`** — imports `SESSION_TRANSPORTS` for the `transport` enum.
- **`src/modules/account/session/device-cookie.ts`** — calls `rememberDevice` after a completed login so a lockout cannot keep the owner out.
- **`src/modules/account/session/login-observability.ts`** — calls `recordLoginSuccess` / `recordLoginFailure` to emit metrics and audit entries.
- **`src/modules/account/roles.ts`** — calls `isUnrestrictedCaller(userId)` to determine the caller's tier for the success record.
- **`src/modules/account/domain/session-proof.ts`** — imports `AMR.password` as the authentication-method reference for both the 2FA challenge and the session's `amr` claim.
- **`src/infrastructure/http/controller.ts`** — uses `rejectValidation` (bad tier) and `refused` (service-level rejection).
- **`src/infrastructure/http/errors.ts`** — uses `rejectDatabaseError` as the catch-all for failures after credential check.
- **`src/infrastructure/http/response.ts`** — uses `successResponse` for 200 replies.
- **`src/infrastructure/i18n/index.ts`** — uses `t` for user-facing status messages.

## Notes

- **Express 5 body quirk:** When no body parser matches the content-type, `request.body` is `undefined` (not `{}`). The `?? {}` guard converts that into an empty object so the service's own 422 fires uniformly instead of a synchronous `TypeError`.
- **Validation ordering is deliberate:** `remember`/`transport` are validated *before* `accountService.login`. A 422 raised here would skip `recordLoginFailure`, dropping the attempt from the audit trail. The service's 422 (malformed body) arrives *after* the failure record.
- **2FA path does not complete the login:** No cookies, no access token, no success record. `postLoginTwoFactor` is responsible for finishing the flow.
- **Catch block ≠ rejected login:** The `.catch` covers both credential-check and post-credential token/cookie failures. In either case the caller may have had the correct password, so the error is forwarded via `rejectDatabaseError` rather than recorded as a login failure.
