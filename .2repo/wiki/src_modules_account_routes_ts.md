# src/modules/account/routes.ts

## Purpose
Express router for the account module. It wires every account/auth HTTP endpoint—login, signup, password reset, email verification, token refresh, session management, address-book CRUD, and account deletion—to its controller, applying shared middleware (auth population, cache-control, rate-limiting) at the appropriate scope.

## Key elements
- **`router`** (exported) — the `express.Router` instance that `./module.ts` mounts into the app.
- **Global middleware** — `getAuth` (populates `request.authContext` when a token is present) and `noStore` (marks every response as non-cacheable) are applied to *all* routes via `router.use`.
- **Route definitions** — ~20 endpoints covering:
  - Auth lifecycle: `POST /login`, `POST /signup`, `POST /reset`, `POST /reset-confirm`, `POST /password`, `GET /refresh`, `POST /logout`, `POST /logout-all`
  - Sessions: `GET /sessions`, `DELETE /sessions/:sessionId`
  - Profile: `GET /`, `PUT /`, `DELETE /`, `DELETE /delete-confirm`
  - Addresses: `GET|POST /addresses`, `PUT|DELETE /addresses/:addressId`
  - Verification: `POST /verify-request`, `POST /verify-confirm`
  - Admin: `DELETE /tokens/expired`
- **Per-route middleware** — `isAuth`, `isAdmin`, `credentialLimiters`, `upload.single('imageUpload')`, and `invalidateCache(keys)` are composed inline per route.

## Relationships
- **`src/infrastructure/http/middlewares/rate-limit.ts`** — supplies `credentialLimiters`, applied to all credential-sensitive routes (login, signup, reset, password, verify).
- **`src/infrastructure/http/middlewares/cache.ts`** — supplies `noStore` (global) and `invalidateCache` (per-route, invalidates cached user/session data on mutations).
- **`src/kernel/middlewares/authorizations.ts`** — supplies `getAuth` (global), `isAuth` (per-route guard), and `isAdmin` (admin-only route).
- **`src/infrastructure/adapters/storage.ts`** — supplies `upload`, used on `PUT /` and `POST /signup` for avatar image uploads.
- **Controllers** (`./controllers/*`) — each imported function is the terminal handler for exactly one route: `getAccount`, `putAccount`, `postLogin`, `postSignup`, `postResetRequest`, `postResetConfirm`, `postPasswordChange`, `getRefreshToken`, `postLogout`, `postLogoutEverywhere`, `getSessions`, `deleteSession`, `postVerifyRequest`, `postVerifyConfirm`, `deleteExpiredTokens`, `getAddresses`, `postAddress`, `putAddress`, `deleteAddress`, `deleteAccountRequest`, `deleteAccountConfirm`.

## Notes
- **`noStore` is global and intentional.** A prior bug: `GET /account` also mounted `setCache`, whose `Cache-Control` header *replaced* the `noStore` header, so browsers cached the caller's own profile for an hour. `noStore` now marks the response first; `setCache` refuses to run on an already-marked response (see `cache.ts`). Do not remove the global `router.use(noStore)`.
- **`getAuth` runs on every route**, including public ones (login, signup, reset). It is non-blocking—its sole job is to populate `request.authContext` when a token happens to be present. Use `isAuth` per route when authentication is actually required.
- **`delete-confirm` and `verify-confirm` are public** (no `isAuth`): the one-time token carried in the request body is the credential.
- **`DELETE /tokens/expired`** is the only route requiring `isAdmin` in addition to `isAuth`.
- **Route ordering matters for the `upload` middleware**: it must appear before the controller but after any `invalidateCache` call that touches the `users` cache key.
