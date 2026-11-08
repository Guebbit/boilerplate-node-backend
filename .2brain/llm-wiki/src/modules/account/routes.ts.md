---
source: src/modules/account/routes.ts
sha256: 6d77758d496d54f3afedc383ea00ce5fec2c4a13d606954f6cceb6c25871c6a6
generated_at: 2026-11-08T04:15:28.018444+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/routes.ts

## Purpose

Express `Router` that wires every HTTP endpoint for the account domain — authentication (login, signup, token refresh, logout), password reset, email verification/change, session management, 2FA lifecycle, OAuth links, account export, and account deletion/restore. It centralizes the auth middleware chain (`getAuth`, `isAuth`, `requireFreshAuth`/`requireFreshAuthWhen`), rate-limiting, upload handling, and cache-control policy so that individual controllers stay focused on business logic.

## Key elements

- **`router`** (exported) — The single `Router` instance; mounted under `/account` by `./module.ts`. All routes share `getAuth` (populates `request.authContext`) and `noStore` (prevents any accidental caching of credential-bearing responses).
- **`isChangingEmail`** (local) — Predicate read by `requireFreshAuthWhen` on `PUT /` and `PATCH /`. Compares the incoming `email` body field against `request.authContext.email` using `normalizeEmail` so casing differences never trigger a false step-up. Must run after `upload.image()` because `request.body` is only populated once multer parses multipart data.
- **`callerHasTwoFactor`** (local) — Reads `request.authContext.twoFactorArmed`; used to add an OTP-proof requirement on identity routes (email change, password change, account deletion).
- **`isChangingEmailWithTwoFactor`** (local) — Combines the two predicates above; gates the OTP-proof variant of the fresh-auth check.
- **`OTP_PROOF`** (local constant) — `{ methods: ['otp'] }` passed to `requireFreshAuthWhen` so an armed account must have completed an OTP re-auth in the current fresh session.
- **Rate-limit chains** — Per-route limiter arrays imported from `./rate-limits` (`credentialLimiters`, `signupLimiters`, `resetRequestLimiters`, `passwordCheckLimiters`, `mfaChallengeLimiter`, `mfaSendLimiter`, `accountCodeSendLimiter`, `loginChallengeGate`, `sessionCredentialLimiters`) and `./mail-budget` (`mailRecipientLimiter`), applied as Express middleware before the controller.
- **Route surface** (non-exhaustive, alphabetical by path): `GET /`, `PUT /`, `PATCH /`, `DELETE /`, `POST /restore`, `POST /login`, `POST /signup`, `POST /password/reset`, `POST /password/reset/confirm`, `POST /password`, `POST /reauth*`, `POST /login/2fa*`, `GET|POST /2fa*`, `GET /refresh`, `POST /logout`, `POST /logout/everywhere`, `GET /sessions`, `DELETE /sessions/:sessionId`, `POST /email-verification/*`, `POST /email-change/*`, `POST /export`, `GET /export`, `GET /export/status`, `POST /login/restore`, `POST /session/touch`, `GET /session`, `GET|DELETE /oauth/links*`, `GET /oauth/start`, `GET /oauth/callback`.

## Relationships

- **`@kernel/middlewares/authorizations`** — Provides `getAuth` (router-level), `isAuth` (per-route guard), and the two fresh-auth helpers (`requireFreshAuth`, `requireFreshAuthWhen`) that enforce recency + optional OTP proof on sensitive/critical mutations.
- **`@infrastructure/http/middlewares/cache`** — `noStore` is applied globally to the router; `setCache` (used elsewhere) is explicitly *not* mounted here to avoid caching a caller's own profile.
- **`@infrastructure/http/middlewares/human-challenge`** — `humanChallengeGate` guards `POST /signup` and `POST /password/reset` (rung-3, off by default).
- **`@infrastructure/http/middlewares/idempotency`** — `idempotencyKey` middleware on `POST /signup` to deduplicate repeated registration attempts.
- **`@infrastructure/http/middlewares/origin`** — `requireAllowedOrigin` imported; applied on routes that accept cross-origin requests (visible in the truncated portion).
- **`@infrastructure/http/middlewares/rate-limit`** — `uploadLimiter` gates the two `upload.image()` routes (`PUT /`, `PATCH /`).
- **`@infrastructure/http/middlewares/upload`** — `upload.image()` parses multipart avatar uploads before the controller; ordering relative to `requireFreshAuthWhen` is load-bearing (see `isChangingEmail` docs).
- **`@infrastructure/persistence/normalize-email`** — Used inside `isChangingEmail` so the route-level guard and the service-layer email comparison always agree on what constitutes a change.
- **Controllers** — Each route delegates to exactly one controller function from `./controllers/*` (e.g. `getAccount`, `replaceAccount`, `deleteAccount`, `cancelPendingEmail`, `postLogin`, `postSignup`, `get2fa`, `getAccountExport`, `deleteOAuthLink`, `deleteSession`). The router contains no business logic beyond the three local predicates.

## Notes

- **Middleware ordering on `PUT`/`PATCH /` is intentional and load-bearing.** `upload.image()` must precede `requireFreshAuthWhen(isChangingEmail, …)` because the predicate reads `request.body`, which is empty until multer finishes parsing. Swapping the order silently disables the email-change gate.
- **`noStore` is router-level, not per-route.** This is a deliberate safety net: a future route that forgets to set cache headers still cannot leak a profile into a CDN. `setCache` checks for the `noStore` marker and refuses to run, so the two middlewares are mutually exclusive by design.
- **`isChangingEmail` is intentionally not exported.** The wiki and tests assert its effect through the `PUT /account` response (401 vs 200) rather than by calling the predicate directly, keeping the contract at the HTTP boundary.
- **`signupLimiters` vs `credentialLimiters`.** Signup and reset-request routes always answer success (201/200), so `credentialLimiters`' `skipSuccessfulRequests` flag would never spend budget. Dedicated limiter chains that *do* count successes are used instead (see `./rate-limits`).
- **The address-book module reuses the `/account` URL prefix** from its own router (`@modules/addresses/routes`); they are separate `Router` instances mounted at the same path segment.
- **`isAuth` before `sessionCredentialLimiters`** on routes like `POST /password` and `POST /email-change/resend`: the per-account rate-limit bucket is keyed off the authenticated session, so the auth check must populate it first.
