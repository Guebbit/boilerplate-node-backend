---
source: src/modules/account/controllers/post-login.ts
sha256: 313de4d7f6fc1aa854ff2ccb514837ae04fe9490f870bc857f5e542ea775ef63
generated_at: 2026-10-15T09:55:23.185535+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/post-login.ts

## Purpose

The `POST /account/login` controller. It validates the request, delegates credential checking to the account service, and on success mints the full session (refresh token, transport cookies, short-lived access token). It also handles the two-factor branch and is the single place where login success/failure metrics, audit entries, and analytics events are emitted — intentionally kept here rather than in the service so that a 422 from body-shape validation does not silently drop the attempt from the trail.

## Key elements

- **`rememberSchema`** — Zod schema validating the optional `remember` (a `RefreshTokenExpiryTime` tier) and `transport` (a `SESSION_TRANSPORTS` value) fields before any credential work begins.
- **`postLogin(request, response)`** — The sole export; the Express handler for `POST /account/login`. Sequence:
  1. Destructures `email`/`password` from `request.body ?? {}` (Express 5 leaves body `undefined` when no parser matched).
  2. Parses `remember`/`transport` via `rememberSchema`; rejects with 422 on failure.
  3. Captures `provedAt = Date.now()` before the hash check.
  4. Calls `accountService.login(email, password)`.
  5. On refusal → `recordLoginFailure` and return.
  6. If `twoFactorEnabledAt` is set → calls `twoFactorService.buildLoginChallenge` and returns a 200 with the challenge payload (no cookies, no access token).
  7. Otherwise → `issueSession` → `recordLoginSuccess` → `rememberDevice` → `successResponse`.
  8. `.catch` → `rejectDatabaseError` (a post-auth infra failure is *not* recorded as a login failure).

## Relationships

- **`@infrastructure/http/controller.ts`** — Provides `rejectValidation` (422) and `refused` (401) used for the early-exit paths.
- **`@infrastructure/http/errors.ts`** — Provides `rejectDatabaseError` for the catch-all on the promise chain.
- **`@infrastructure/http/response.ts`** — Provides `successResponse` for the 200 reply.
- **`@infrastructure/i18n/index.ts`** — `t()` localises the human-readable `message` in success and 2FA-required responses.
- **`src/modules/account/services/index.ts`** — Source of `accountService.login` and `twoFactorService.buildLoginChallenge`.
- **`src/modules/account/session/config.ts`** — `RefreshTokenExpiryTime` enum constrains the `remember` tier.
- **`src/modules/account/session/strategy.ts`** — `SESSION_TRANSPORTS` enum constrains the `transport` field.
- **`src/modules/account/session/session.ts`** — `issueSession` performs the actual token minting and cookie setting.
- **`src/modules/account/session/device-cookie.ts`** — `rememberDevice` marks the browser as familiar for lockout-reset purposes.
- **`src/modules/account/session/login-observability.ts`** — `recordLoginSuccess` / `recordLoginFailure` emit metrics, audit, and analytics events.
- **`src/modules/account/domain/session-proof.ts`** — `AMR.password` is placed in the session's authentication-methods list.
- **`@types`** — `LoginRequest` and `LoginOutcome` shape the typed request body and response payload.
- **`src/modules/account/routes.ts`** — Registers `postLogin` as the handler for `POST /account/login`.

## Notes

- **Express 5 body quirk:** `request.body` is typed `LoginRequest | undefined` because Express 5 sets it to `undefined` (not `{}`) when no body parser matches the `Content-Type`. The `?? {}` guard is therefore load-bearing, not defensive noise.
- **Metrics live in the controller, not the service:** A 422 raised inside `accountService.login` still flows through `recordLoginFailure` because it is thrown *after* the credential check. A 422 raised here (e.g. bad `remember` tier) is by design non-secret and does not touch the credential trail.
- **2FA is a 200, not a 401:** When two-factor is enabled the controller returns HTTP 200 with a challenge object; the login is *incomplete*, not failed. `recordLoginFailure` is not called on this path.
- **`provedAt` is captured before the hash check** so that a password rotation occurring during the request causes the issued session to be invalidated (the service compares against this timestamp).
- **Catch-all does not record a login failure:** An infrastructure error (DB down, token-signing failure) after a successful credential check is *not* a rejected login; `rejectDatabaseError` handles it without touching the observability path.
