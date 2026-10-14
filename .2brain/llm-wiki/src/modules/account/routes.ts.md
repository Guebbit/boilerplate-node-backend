---
source: src/modules/account/routes.ts
sha256: ae1daf17e33ec841a6e88c2ff9ee8820eb959b83648c7abaff14cf8189d1ec9f
generated_at: 2026-10-14T08:46:29.352667+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/routes.ts

## Purpose

Express router for the account module. Wires every account-related HTTP endpoint—authentication (login, signup, refresh, logout), password reset, email verification, 2FA, sessions, OAuth, and account deletion—into a single `/account` mount point, and applies shared cross-cutting middleware (auth population, cache suppression, rate limiting, fresh-session gates) at the route level so individual controllers stay focused on business logic.

## Key elements

- **`router`** (exported) — The `express.Router` instance; all routes are registered here. Mounted by `./module.ts`.
- **`isChangingEmail(request)`** (module-private) — Returns `true` when the request body's `email` differs from the caller's current email (compared via `normalizeEmail`). Used as the predicate for `requireFreshAuthWhen` on `PUT`/`PATCH /`.
- **`callerHasTwoFactor(request)`** (module-private) — `true` when `request.authContext.twoFactorArmed` is set; gates the OTP-proof requirement on sensitive/critical routes.
- **`isChangingEmailWithTwoFactor(request)`** (module-private) — Combines the two predicates above; triggers the stricter `OTP_PROOF` gate.
- **`OTP_PROOF`** — Constant `{ methods: ['otp'] }` passed to `requireFreshAuthWhen` so armed accounts must have proved a second-factor code during re-authentication.
- **Route definitions** — ~40 endpoints covering: profile CRUD, login/signup/logout, password reset & change, 2FA setup/confirm/delete, session list/delete, email verification & change, account deletion (request + confirm), OAuth link management, and account export.

## Relationships

- **`authorizations.ts`** — `getAuth` (applied to all routes), `isAuth`, `requireFreshAuth`, `requireFreshAuthWhen` are the primary auth/session guards on every protected route.
- **`cache.ts`** — `noStore` is mounted router-wide so no credential or auth-state response can be cached; it also prevents `setCache` from running on these routes.
- **`rate-limit.ts`** — `uploadLimiter` guards the `PUT`/`PATCH /` avatar-upload paths; module-local limiters (`credentialLimiters`, `signupLimiters`, `resetRequestLimiters`, `passwordCheckLimiter`, `mfaChallengeLimiter`, `mfaSendLimiter`, `accountCodeSendLimiter`, `loginChallengeGate`) are imported from `./rate-limits` and applied per route.
- **`human-challenge.ts`** — `humanChallengeGate` is rung-3 (off by default) on `POST /signup` and `POST /reset`.
- **`idempotency.ts`** — `idempotencyKey` middleware on `POST /signup` to prevent duplicate account creation from retried requests.
- **`origin.ts`** — `requireAllowedOrigin` is imported and applied to routes that require a trusted `Origin` header.
- **`upload.ts`** — `upload.image()` middleware on `PUT`/`PATCH /` for avatar uploads; must precede `requireFreshAuthWhen` (see Notes).
- **`normalize-email.ts`** — Used inside `isChangingEmail` for case-insensitive comparison so the gate and the service agree on what counts as an email change.
- **Controllers** — Each route delegates to a dedicated controller function in `./controllers/` (e.g. `delete-account-request.ts`, `delete-account-confirm.ts`, `delete-2fa.ts`, `delete-2fa-method.ts`, `delete-session.ts`, `delete-oauth-link.ts`, `cancel-pending-email.ts`, etc.).

## Notes

- **Middleware order on `PUT`/`PATCH /` is load-bearing.** `upload.image()` must run before `requireFreshAuthWhen(isChangingEmail, …)` because `request.body` does not exist until multer parses `multipart/form-data`; the predicate would otherwise see an empty object and gate nothing.
- **`noStore` is router-level, not per-route.** This guarantees that any route added later to the account module is automatically non-cacheable and cannot silently opt out.
- **`isAuth` precedes `credentialLimiters`** on `/password`, `/reauth`, and `/verify-request` so the per-identity rate-limit budget is read from the authenticated session rather than the (anonymous) request body.
- **The address-book module** (`@modules/addresses/routes`) shares the `/account` URL prefix from its own router; routes here are the canonical `/account/*` set.
- **`isChangingEmail` is intentionally not exported.** It is only exercised through the `PUT /account` route itself; testing it in isolation would bypass the real middleware ordering.
