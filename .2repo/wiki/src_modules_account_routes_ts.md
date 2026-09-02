# src/modules/account/routes.ts

## Purpose

Express router for the account module. It declares every HTTP route for authentication (login, signup, token refresh, logout), password management, email verification, two-factor auth, session management, address-book CRUD, and account lifecycle (deletion, data export). Cross-cutting concerns—rate limiting, auth-context population, cache invalidation, and fresh-session re-auth—are wired in at the route level here rather than inside individual controllers.

## Key elements

- **`router`** (exported) — the Express `Router` instance; all middleware and route handlers are chained onto it.
- **`isChangingEmail`** (module-private) — predicate passed to `requireFreshAuthWhen` on `PUT /`. Returns `true` only when the request body carries an `email` field that differs from the caller's current email. Must be evaluated *after* multer has parsed the multipart body.
- **Router-level middleware** — `getAuth` (populates `request.authContext` when a token is present, on every route) and `noStore` (marks all responses non-cacheable so no route can accidentally serve a cached profile).
- **Route definitions** — one handler per REST action, each importing its controller from `./controllers/*`. Notable groupings:
  - Auth flow: `POST /login`, `POST /signup`, `GET /refresh`, `POST /logout`, `POST /logout-all`, `POST /reauth`.
  - Password: `POST /reset`, `POST /reset-confirm`, `POST /password`.
  - 2FA: `POST /login/2fa`, `POST /2fa/setup`, `POST /2fa/confirm`, `DELETE /2fa`.
  - Sessions: `GET /sessions`, `DELETE /sessions/:sessionId`.
  - Address book: `GET/POST/PUT/DELETE /addresses[/:addressId]`.
  - Account lifecycle: `DELETE /`, `DELETE /delete-confirm`, `POST /export`, `DELETE /tokens/expired` (admin).
  - Email verification: `POST /verify-request`, `POST /verify-confirm`.

## Relationships

| Neighbor | Interaction |
|---|---|
| `infrastructure/adapters/storage.ts` | Imports `upload` (multer-based) for `imageUpload` on `PUT /` and `POST /signup`. |
| `infrastructure/http/middlewares/cache.ts` | Imports `noStore` (router-level) and `invalidateCache` (per destructive/mutating route). |
| `infrastructure/http/middlewares/rate-limit.ts` | Imports `credentialLimiters`, `uploadLimiter`, `mfaChallengeLimiter` and attaches them to the relevant routes. |
| `kernel/middlewares/authorizations.ts` | Imports `getAuth`, `isAuth`, `isAdmin`, `requireFreshAuth`, `requireFreshAuthWhen`, and the `REAUTH_TIME_CRITICAL` / `REAUTH_TIME_SENSITIVE` constants. |
| `controllers/get-account.ts` | Handler for `GET /`. |
| `controllers/get-addresses.ts` | Handler for `GET /addresses`. |
| `controllers/get-refresh-token.ts` | Handler for `GET /refresh`. |
| `controllers/get-sessions.ts` | Handler for `GET /sessions`. |
| `controllers/delete-session.ts` | Handler for `DELETE /sessions/:sessionId`. |
| `controllers/delete-address.ts` | Handler for `DELETE /addresses/:addressId`. |
| `controllers/delete-account-request.ts` | Handler for `DELETE /`. |
| `controllers/delete-account-confirm.ts` | Handler for `DELETE /delete-confirm`. |
| `controllers/delete-expired-tokens.ts` | Handler for `DELETE /tokens/expired`. |
| `controllers/delete-2fa.ts` | Handler for `DELETE /2fa`. |
| `controllers/post-2fa-confirm.ts` | Handler for `POST /2fa/confirm`. |

*(Controllers not listed above are also imported but fall outside the provided neighbor set.)*

## Notes

- **Middleware order is load-bearing on `PUT /`.** `upload.single('imageUpload')` must precede `requireFreshAuthWhen(isChangingEmail, …)` because `request.body` is empty until multer parses the multipart payload. Reordering would make the predicate always return `false`, silently disabling the email-change gate.
- **`noStore` is router-level, not per-controller.** This guarantees that any future route added to this file is non-cacheable by default. A separate `setCache` call will refuse to run if it detects the `noStore` marker, preventing the header-replacement bug that previously let browsers cache a user's own profile for an hour.
- **Fresh-auth tiers are deliberate.** `PUT /` uses `REAUTH_TIME_SENSITIVE` (not CRITICAL) so an avatar-only upload doesn't trigger a password re-proof; only an actual email change is gated. Destructive or 2FA-enrollment routes use `REAUTH_TIME_CRITICAL`.
- **`DELETE /2fa` has a dual gate:** `requireFreshAuth(REAUTH_TIME_CRITICAL)` *and* a valid code in the request body. Neither alone is sufficient.
- **`getAuth` runs on public routes too** (`POST /login`, `POST /signup`, etc.) to populate `authContext` when a token happens to be present; `isAuth` is the actual access gate and is only applied where auth is required.
