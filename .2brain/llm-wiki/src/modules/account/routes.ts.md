---
source: src/modules/account/routes.ts
sha256: cb97189396a42a9876db15b97ecaad376c1f503590b7051192ea323957ce5a07
generated_at: 2026-09-23T18:08:07.696863+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/routes.ts

## Purpose
Express router that wires every account-domain HTTP endpoint (authentication, password reset, 2FA, sessions, email verification, account deletion, OAuth, data export) under the shared `/account` prefix. It applies cross-cutting middleware—auth context, rate-limiting, caching, human-challenge, idempotency—at the route level so individual controllers stay focused on business logic.

## Key elements
- **`router`** (exported) – The Express `Router` instance mounted at `/account` by `./module.ts`.
- **`isChangingEmail`** – Predicate passed to `requireFreshAuthWhen` on `PUT /account`; mirrors the exact email-comparison `putAccount` makes so guard and controller never disagree.
- **Route definitions** – One entry per endpoint, each composing the middleware chain in a specific order:
  - `GET /` → `getAccount`
  - `PUT /` → `upload.single` → `requireFreshAuthWhen(isChangingEmail)` → `putAccount`
  - `DELETE /` → `deleteAccountRequest`; `DELETE /delete-confirm` → `deleteAccountConfirm`
  - `POST /login`, `/signup`, `/reset`, `/reset-confirm`, `/password`, `/password/check`, `/reauth`
  - `GET /abilities` → `getMyAbilities` (intentionally unguarded beyond `getAuth`)
  - `GET /refresh`, `POST /logout`, `POST /logout-all`
  - `GET /sessions`, `DELETE /sessions/:sessionId`
  - `POST /verify-request`, `/verify-confirm`, `/email-change-confirm`
  - `DELETE /tokens/expired` → `deleteExpiredTokens`
  - `POST /export` → `postAccountExport`
  - `POST /login/2fa/send`, `POST /login/2fa`, `GET /2fa`, 2FA setup/confirm/delete routes
  - OAuth provider/start/callback routes

## Relationships
- **`@kernel/middlewares/authorizations`** – Imports `getAuth`, `isAuth`, `requirePermission`, `requireFreshAuth`, `requireFreshAuthWhen`, and the `REAUTH_TIME_*` constants; these gate nearly every route.
- **`@infrastructure/http/middlewares/rate-limit`** – Imports `uploadLimiter` (global upload-size/throughput guard); per-route credential/signup/reset limiters come from the local `./rate-limits`.
- **`@infrastructure/http/middlewares/human-challenge`** – Imports `humanChallengeGate`, applied on `/signup` and `/reset` as a pre-parse anti-bot rung.
- **`@infrastructure/http/middlewares/idempotency`** – Imports `idempotencyKey`, applied on `/signup` after the upload parse.
- **`@infrastructure/http/middlewares/upload`** – Imports `upload` (multer); `.single('imageUpload')` is used on `PUT /` and `POST /signup`.
- **`@infrastructure/http/middlewares/cache`** – Imports `noStore` (applied router-wide) and `invalidateCache` (applied per mutating route to bust `users`/`account` cache tags).
- **Controllers** (`./controllers/*`) – Each route delegates to exactly one controller handler (e.g., `getAccount`, `deleteSession`, `delete2faMethod`, `delete2fa`, `deleteExpiredTokens`, `getMyAbilities`, `deleteAccountConfirm`, `deleteAccountRequest`, `get2fa`).

## Notes
- **Middleware order is load-bearing.** `isChangingEmail` and `idempotencyKey` both read `request.body`, which only exists after `upload.single` has parsed multipart data. Placing them earlier silently degrades (empty body → predicate always false / identical fingerprint).
- **`noStore` is router-wide.** It marks every response as non-cacheable so that no future route can accidentally let `setCache` cache a user's own profile. Per-route `invalidateCache` calls handle active-cache busting on mutations.
- **Route ordering matters for 2FA.** `POST /login/2fa/send` is declared *before* `POST /login/2fa` so the longer path matches first in Express.
- **Limiter choice is deliberate per route.** `credentialLimiters` uses an identity key and `skipSuccessfulRequests`; routes that always return 200 (`/reset`, `/password/check`) use dedicated limiters because a success-based budget would never spend.
- **The address book module** shares the `/account` URL prefix from its own routes file (`@modules/addresses/routes`); this router does not mount those paths.
- **`GET /abilities` is intentionally open** (only `getAuth`, no `isAuth`) so unauthenticated visitors receive the `guest` rule set for client-side rendering.
