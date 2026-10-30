---
source: src/modules/account/routes.ts
sha256: 928e090ce85ec8b8b3a6ec00cd440a2f7c3cc3441b6aad07762b7cdf367898f1
generated_at: 2026-10-29T02:39:13.530773+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/routes.ts

## Purpose
Express router that wires every account-domain endpoint (auth, profile, email verification, password, 2FA, sessions, OAuth links, export, deletion/restore) under the `/account` prefix. It composes per-route middleware—rate limiters, human-challenge gates, idempotency, upload, and authorization predicates—around thin controller handlers so that policy is declared once at the route level.

## Key elements
- **`router`** (exported) — the Express `Router` instance; mounted by `./module.ts`. All routes share `getAuth` (populates `request.authContext`) and `noStore` (prevents caching of auth-state responses).
- **`isChangingEmail`** (local) — predicate used by `requireFreshAuthWhen` on `PUT/PATCH /`; returns `true` when the body's `email` differs (case-insensitively, via `normalizeEmail`) from `request.authContext.email`. Must run after `upload.image()` so `request.body` is populated.
- **`callerHasTwoFactor`** (local) — checks `request.authContext.twoFactorArmed`; used to gate identity-critical routes behind an OTP proof.
- **`isChangingEmailWithTwoFactor`** (local) — conjunction of the two above; triggers the stricter `OTP_PROOF` step-up before the plain recency guard.
- **`OTP_PROOF`** (local const) — `{ methods: ['otp'] }` passed to `requireFreshAuthWhen` so armed accounts must have proven a code in the fresh session.
- Route table (selected patterns):
  - `POST /login`, `POST /signup`, `POST /password/reset` — public credential routes with tiered rate limiters and optional human-challenge gates.
  - `GET/PUT/PATCH /` — profile read/write; write paths mount `upload.image()` before `requireFreshAuthWhen`.
  - `DELETE /` — account lock + scheduled erasure; requires `'critical'` fresh auth, plus OTP proof when 2FA is armed.
  - `POST /restore` — token-based un-delete; public, bounded by `credentialLimiters`.
  - 2FA, sessions, OAuth-link, and export sub-routes follow the same controller-per-handler pattern.

## Relationships
- **`@infrastructure/http/middlewares/cache`** — `noStore` is applied router-wide; the comment in `cache.ts` documents that `setCache` refuses to run on `noStore`-marked responses, preventing a per-route `setCache` from accidentally caching a profile `GET`.
- **`@infrastructure/http/middlewares/human-challenge`** — `humanChallengeGate` is mounted on `POST /signup` and `POST /password/reset` as a rung-3 gate (disabled by default).
- **`@infrastructure/http/middlewares/idempotency`** — `idempotencyKey` is mounted on `POST /signup` to deduplicate concurrent registration attempts.
- **`@infrastructure/http/middlewares/origin`** — `requireAllowedOrigin` is imported for cross-origin-sensitive routes.
- **`@infrastructure/http/middlewares/rate-limit`** — `uploadLimiter` (imported from here) is mounted on `PUT/PATCH /`; module-local limiters (`credentialLimiters`, `signupLimiters`, etc.) from `./rate-limits` cover the rest.
- **`@infrastructure/http/middlewares/upload`** — `upload.image()` is mounted before the fresh-auth predicates on profile write routes; ordering is load-bearing (see `isChangingEmail` docs).
- **`@infrastructure/persistence/normalize-email`** — `normalizeEmail` is called inside `isChangingEmail` so the route-level guard and the service-level email comparison never disagree.
- **`@kernel/middlewares/authorizations`** — `getAuth`, `isAuth`, `requireFreshAuth`, `requireFreshAuthWhen` are the authorization primitives applied per route.
- **Controllers** (e.g. `get-account`, `delete-account`, `delete-session`, `get-2fa`, `get-account-export`, `cancel-pending-email`, `delete-oauth-link`, …) — each is a terminal handler in a route chain; this file is their sole wiring point.

## Notes
- **Middleware order is a contract.** `upload.image()` must precede `requireFreshAuthWhen(isChangingEmail…)` because the predicate reads `request.body`, which only exists after multer parses `multipart/form-data`. Swapping them silently disables the guard.
- **`noStore` vs. `setCache`.** `noStore` is applied at the router level *before* any route. If a controller later calls `setCache`, the cache middleware will detect the existing `noStore` marker and skip—preventing a profile response from being cached for an hour.
- **`isChangingEmail` is intentionally not exported.** Integration tests assert its effect through `PUT /account` (stale session → 401/428) rather than by calling the predicate directly.
- **Rate-limiter choice is semantic.** `credentialLimiters` skips successful requests (useful for login where success means the budget is irrelevant); `signupLimiters` and `resetRequestLimiters` do *not*, because those routes always answer 200/201, so only a success-bounded budget throttles them.
- **The address-book module** shares the `/account` prefix from its own router (`@modules/addresses/routes`); they are sibling mounts, not nested.
