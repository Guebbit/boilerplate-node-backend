# src/modules/account/tests/unit/routes.test.ts

## Purpose

Unit test for the account router that locks down three security-critical, type-invisible arrangements: `noStore` on every route (prevents browser/storage of a caller's own profile), paired credential rate-limiters on identity-sensitive endpoints, and deliberate public access on token-bearing routes. It exists so a refactor that silently reorders middleware, drops a limiter half, or adds `isAuth` to a reset flow is caught at the router level rather than in production.

## Key elements

- **`chainOf(signature)`** – Resolves the full middleware chain for a given `"METHOD /path"` string from the live router.
- **`TOKEN_BEARING`** – List of 5 routes (`/delete-confirm`, `/reset-confirm`, `/verify-confirm`, `/refresh`, `/logout`) asserted to lack `isAuth` because the emailed token or cookie *is* the credential.
- **`RATE_LIMITED`** – List of 7 credential routes asserted to carry both `credentialLimiters[0]` and `[1]` (identity-keyed and address-keyed budgets).
- **`AUTHENTICATED`** – List of 13 self-service routes asserted to include `isAuth`.
- **`describe('…what is mounted')`** – Verifies the exact endpoint list/order, router-level middleware (`getAuth`, `noStore`), and per-route `noStore` presence.
- **`describe('…authorization')`** – Checks `isAuth` / absence-of-`isAuth`, the sole admin guard (`DELETE /tokens/expired`), and `isAuth`-before-`isAdmin` ordering.
- **`describe('…credential rate limiting')`** – Asserts both limiters per route, limiter-before-`isAuth` ordering on `/password` and `/verify-request`, and that non-credential routes carry no `credentialLimiters`.
- **`describe('…cache invalidation and uploads')`** – Asserts `invalidateCache([users|account])` on mutation routes, narrower `[account]` on `/logout-all`, upload middleware triple on `PUT /` and `POST /signup`, and zero `setCache` mounts anywhere.

## Relationships

- **`src/modules/account/routes.ts`** – System under test. Imported as `router`; every assertion reads its live middleware chain.
- **`tests/support/routes.ts`** – Provides the test harness: `routeTable`, `routeSignatures`, `routerMiddleware`, `guardsOn` (route-introspection helpers) and the `cacheMock`, `securityMock`, `storageMock` factories used inside the three `jest.mock` calls to stub `@infrastructure/http/middlewares/cache`, `…/security`, and `@infrastructure/adapters/storage`.

## Notes

- The `jest.mock` factories call `jest.requireActual('@tests/routes').cacheMock()` etc. — the mocks are *defined* in the support file, not inline, so the security limiter labels (`credentialLimiters[0]`, `credentialLimiters[1]`) are shared between test and mock.
- Per-route `noStore` assertion (`it.each`) exists because a route mounted *above* the router-level `use(noStore)` would be silently cacheable; a single router-level check would not catch that.
- Limiter-before-`isAuth` ordering is tested only on `POST /password` and `POST /verify-request` — the two authenticated credential routes — because on those a reversed order would cost a full session lookup per rejected flood request.
- `invalidateCache` tag width is intentionally different: `users|account` for mutations that change the row served by both `/account` and `/users/:id`, but only `account` on `POST /logout-all` to avoid evicting the entire admin user directory on every mass-logout.
