---
source: src/modules/account/routes.ts
sha256: 73e1527c652136189c0227ebdf47f04e3135d25487d0624b8c6a0486b316f303
generated_at: 2026-11-14T18:41:00.113151+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/routes.ts

## Purpose

Express router that mounts every endpoint in the account module under the `/account` prefix. It wires up authentication (login, signup, token refresh, logout), password reset, email verification, email change, 2FA, re-authentication/step-up, session management, OAuth linking, account export, and account deletion. It also applies the cross-cutting middlewares (auth context, no-cache, origin checks) that every route in the module needs.

## Key elements

- **`router`** (exported) — the single Express `Router` instance; all account endpoints are registered on it. Mounted at `/account` by `./module.ts`.
- **`callerHasTwoFactor(request)`** — predicate that returns `true` when `request.authContext.twoFactorArmed` is set; used as the condition for `requireFreshAuthWhen` so that only 2FA-armed accounts must additionally present an OTP proof.
- **`OTP_PROOF`** — frozen constant `{ methods: ['otp'] }` passed as the required AMR to `requireFreshAuthWhen`.
- **Route registrations** — ~40 `router.{get,post,put,patch,delete}` calls, each composing a specific middleware chain (auth gates, rate limiters, human-challenge, upload, origin check) followed by a controller from `./controllers/*`.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/infrastructure/http/middlewares/cache.ts` | Applies `noStore` to the entire router; `setCache` in that module refuses to overwrite a response already marked by `noStore`. |
| `src/infrastructure/http/middlewares/human-challenge.ts` | `humanChallengeGate` is chained onto `POST /signup` and `POST /password/reset` as a run-3 (off-by-default) challenge. |
| `src/infrastructure/http/middlewares/idempotency.ts` | `idempotencyKey` middleware is applied to `POST /signup` to deduplicate concurrent registrations. |
| `src/infrastructure/http/middlewares/origin.ts` | `requireAllowedOrigin` guards `POST /refresh` and `POST /logout`, where the refresh cookie is the sole credential. |
| `src/infrastructure/http/middlewares/rate-limit.ts` | `uploadLimiter` is used on profile PUT/PATCH; the local `./rate-limits` module (sibling) exports the credential, signup, reset, MFA, and account-code limiters referenced throughout. |
| `src/infrastructure/http/middlewares/upload.ts` | `upload.image()` is mounted on `PUT /` and `PATCH /` for avatar uploads. |
| `src/kernel/middlewares/authorizations.ts` | `getAuth` is applied router-wide; `isAuth`, `requireFreshAuth`, and `requireFreshAuthWhen` gate individual routes. |
| `src/modules/account/controllers/delete-account.ts` | Handler for `DELETE /` (account lock + scheduled erasure). |
| `src/modules/account/controllers/delete-email-change.ts` | Handler for `DELETE /email-change` (cancel pending email change). |
| `src/modules/account/controllers/delete-oauth-link.ts` | Handler for `DELETE /oauth-links/:id`. |
| `src/modules/account/controllers/delete-session.ts` | Handler for `DELETE /sessions/:sessionId`. |
| `src/modules/account/controllers/get-2fa.ts` | Handler for `GET /2fa`. |
| `src/modules/account/controllers/get-account-export.ts` | Handlers for `GET /export` and `GET /export/status`. |
| `src/modules/account/controllers/get-account.ts` | Handler for `GET /` (current profile). |
| `src/modules/account/controllers/get-oauth-callback.ts` | Handler for `GET /oauth/callback` (OAuth redirect target). |

## Notes

- **`noStore` is router-wide, not per-route.** The comment explains that `setCache`'s `Cache-Control` header *replaces* whatever `noStore` set, so a future route that also mounts `setCache` would silently cache the caller's own profile. `setCache` detects the `noStore` mark and refuses to run.
- **Middleware ordering is load-bearing.** `signedInCredentialLimiters` must appear *after* `isAuth` because it reads the signed-in account from the request context to key the per-account budget. `passwordCheckLimiters` deliberately avoids `credentialLimiters` because the request body carries no identity field.
- **`POST /refresh` is a POST, not a GET**, because it rotates the refresh token (a state change). It is also the only route that relies solely on the cookie for authentication, hence the origin check.
- **No upload middleware on `POST /signup`.** A stranger cannot write to the image store before an account exists; the avatar is set via a follow-up `PATCH /account` from the signed-in session.
- **The `/account` prefix is shared** with the address-book module (`src/modules/addresses/routes`), which registers its own routes under the same path segment.
- **Step-up is conditional.** Routes that change identity (email, password, delete) require a fresh session unconditionally, but only demand an additional OTP proof when `callerHasTwoFactor` is true. Accounts without 2FA face no extra gate.
