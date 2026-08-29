# src/modules/account/routes.ts

## Purpose

Express router that wires all account and authentication endpoints (profile, login, signup, password reset, token refresh, sessions, addresses, email verification, account deletion) to their controller handlers, applying shared and per-route middleware (auth, rate-limiting, cache invalidation, upload).

## Key elements

- **`router`** (export) — the `express.Router` instance mounted under `/account` upstream.
- **Router-wide middleware** — `getAuth` (populates `request.authContext` when a token is present, non-blocking) and `noStore` (sets `Cache-Control: no-store` on every response).
- **Profile routes** — `GET /` (getAccount), `PUT /` (putAccount, with `upload.single('imageUpload')`), `DELETE /` (deleteAccountRequest).
- **Auth routes** — `POST /login`, `POST /signup` (with upload), `POST /reset`, `POST /reset-confirm`, `POST /password`, `GET /refresh`, `POST /logout`, `POST /logout-all`.
- **Session routes** — `GET /sessions`, `DELETE /sessions/:sessionId`.
- **Address routes** — `GET|POST /addresses`, `PUT|DELETE /addresses/:addressId`.
- **Verification routes** — `POST /verify-request`, `POST /verify-confirm` (public; token is the credential).
- **Admin route** — `DELETE /tokens/expired` (requires `isAuth` + `isAdmin`).

## Relationships

- **`src/kernel/middlewares/authorizations.ts`** — supplies `getAuth` (router-wide), `isAuth` (per-route guard), `isAdmin` (admin guard on the expired-token purge).
- **`src/infrastructure/http/middlewares/security.ts`** — supplies `credentialLimiters`, applied to login, signup, reset, password-change, and verify routes as a rate limit.
- **`src/infrastructure/http/middlewares/cache.ts`** — supplies `noStore` (router-wide) and `invalidateCache(tags)` (applied on mutating routes that change user/account state).
- **`src/infrastructure/adapters/storage.ts`** — supplies `upload` (multer-style) for the `imageUpload` field on `PUT /` and `POST /signup`.
- **`./controllers/*`** — each handler is imported from its own controller file and mounted as the final middleware in the route chain.

## Notes

- `noStore` is applied **router-wide** rather than per-controller to prevent a future route from silently omitting it. A past bug had `GET /` mounting `setCache`, whose `Cache-Control` write overrode `noStore`; `setCache` now refuses to run on responses already marked by `noStore` (mutual exclusion in `cache.ts`).
- `getAuth` (router-wide) is **non-blocking** — it attaches `authContext` when a token is present but does not reject unauthenticated requests. Enforced auth is done per-route via `isAuth`.
- `POST /verify-confirm` is intentionally **public** (no `isAuth`); the emailed token in the body is the credential.
- Account deletion is two-step: `DELETE /` creates the request, `DELETE /delete-confirm` finalises it using a token.
- `invalidateCache(['users','account'])` is applied to every route that mutates user or account data (PUT profile, signup, reset-confirm, logout-all, verify-confirm, delete-confirm, delete-expired-tokens) so downstream caches are tagged for invalidation.
