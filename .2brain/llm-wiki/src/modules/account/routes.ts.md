---
source: src/modules/account/routes.ts
sha256: 87488d33fab9e09df529259242f33aba5c2bea67b3ffeb68851b9760ddd3f9cc
generated_at: 2026-09-27T14:28:39.636183+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/routes.ts

## Purpose

Express router for the account module's entire HTTP surface: auth (login, signup, refresh, logout), password management, email verification, 2FA, sessions, account deletion/export, and OAuth. Mounted under the `/account` prefix (see `./module.ts` for the mount point). It exists as the single wiring file where every controller handler, rate-limiter, auth guard, and HTTP-infrastructure middleware is ordered per route.

## Key elements

- **`router`** (exported) — the `express.Router()` instance; the only public export.
- **`isChangingEmail`** (internal) — predicate that compares `request.body.email` against `request.authContext.email` using `normalizeEmail`. Feeds `requireFreshAuthWhen` on `PUT`/`PATCH /` so only an actual email change triggers a step-up re-auth.
- **Router-wide middleware** — `getAuth` (populates `authContext`) and `noStore` (marks every response non-cacheable; prevents any route from accidentally serving a cached profile or credential response).

## Relationships

- **`authorizations.ts`** — source of `getAuth`, `isAuth`, `requirePermission`, `requireFreshAuth`, `requireFreshAuthWhen`, and the `REAUTH_TIME_CRITICAL` / `REAUTH_TIME_SENSITIVE` tiers. Applied per-route and router-wide.
- **`rate-limit.ts`** — provides `uploadLimiter` (PUT/PATCH `/`, signup) and the local `credentialLimiters`, `signupLimiters`, `resetRequestLimiters`, `passwordCheckLimiter`, `mfaChallengeLimiter`, `mfaSendLimiter`, `loginChallengeGate` defined in `./rate-limits`.
- **`human-challenge.ts`** — `humanChallengeGate` guards `POST /signup` and `POST /reset` (rung 3, off by default).
- **`idempotency.ts`** — `idempotencyKey` is applied to `POST /signup`, ordered **after** `upload.image()`.
- **`upload.ts`** — `upload.image()` handles multipart avatar payloads on `PUT`/`PATCH /` and `POST /signup`.
- **`cache.ts`** — `noStore` is applied router-wide; the file's comment documents the mutual-exclusion contract with `setCache`.
- **`normalize-email.ts`** — `normalizeEmail` is called inside `isChangingEmail` so the guard and the service compare emails identically.
- **Controllers** (each is a single route handler wired into this router): `cancel-pending-email`, `delete-2fa-method`, `delete-2fa`, `delete-account-confirm`, `delete-account-request`, `delete-expired-tokens`, `delete-session`, `get-2fa`, plus many others (login, signup, password, sessions, OAuth, export, etc.).

## Notes

- **Middleware order is load-bearing on two routes.** Both `isChangingEmail` (on PUT/PATCH `/`) and `idempotencyKey` (on POST `/signup`) must run **after** `upload.image()`, because they read `request.body`, which multer only populates once it has parsed the multipart stream. Mounting either earlier reads an empty body and silently disables the guard or fingerprint.
- **Fresh-auth tiers are deliberate, not arbitrary.** `DELETE /` (account destruction) uses `REAUTH_TIME_CRITICAL`; `POST /logout-all`, `DELETE /sessions/:id`, and `POST /export` use `REAUTH_TIME_SENSITIVE`. An unconditional gate on `PUT /` would force a password on every avatar upload, so the sensitive tier is gated *conditionally* on `isChangingEmail`.
- **`GET /abilities` has no auth guard beyond router-wide `getAuth`.** Guests have rules (the `guest` role); the route is intentionally public so a client can render permissions before login.
- **`GET /refresh` requires no auth** — the JWT cookie *is* the credential for minting a new access token.
- **`POST /password/check` uses `passwordCheckLimiter`** (address-keyed), not `credentialLimiters`, because the request body carries no email/username; the latter's identity key would bucket every caller as `anonymous` under one shared budget.
- **The address-book module reuses the `/account` prefix** from its own routes file (`@modules/addresses/routes`); this file does not mount it.
- **`PUT /` replaces the full profile; `PATCH /` merges.** Both accept multipart image uploads and both apply the same email-change step-up gate.
