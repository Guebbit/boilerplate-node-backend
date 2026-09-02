# src/modules/account/tests/unit/routes.test.ts

## Purpose

Validates the account route table's middleware chains, authorization guards, rate-limit budgets, and cache behavior. It exists to lock down three properties that TypeScript cannot express: every route is `noStore`, credential routes carry *both* rate-limit budgets, and token-bearing routes are intentionally public. A single ordering or omission regression here is an account-takeover vector.

## Key elements

- **`chainOf(signature)`** — looks up the full middleware chain for a given `"METHOD /path"` signature in the router table.
- **`TOKEN_BEARING`** — list of 5 routes (`DELETE /delete-confirm`, `POST /reset-confirm`, `POST /verify-confirm`, `GET /refresh`, `POST /logout`) asserted to be public (no `isAuth`).
- **`RATE_LIMITED`** — list of 9 routes that must carry *both* `credentialLimiters[0]` and `credentialLimiters[1]`.
- **`AUTHENTICATED`** — list of 18 first-person routes that must include `isAuth` in their chain.
- **`describe('account routes — what is mounted')`** — asserts exact endpoint set/order, global `['getAuth', 'noStore']` middleware, and per-route `noStore`.
- **`describe('account routes — authorization')`** — asserts `isAuth` presence/absence per route, the single `isAdmin` guard on `DELETE /tokens/expired`, and that `isAuth` precedes `isAdmin`.
- **`describe('account routes — credential rate limiting')`** — asserts both limiters on credential routes, limiter-before-auth ordering, and absence of limiters on non-credential routes.
- **`describe('account routes — cache invalidation and uploads')`** — asserts `invalidateCache` tag coverage, upload middleware (`upload.single(imageUpload)`, `validateUploadedImages`, `quarantineUploadedImages`), and that no route mounts `setCache`.

## Relationships

- **`src/modules/account/routes.ts`** — the module under test; this file imports its exported `router` and inspects its middleware chains.
- **`tests/support/routes.ts`** — provides the inspection helpers (`routeTable`, `routeSignatures`, `routerMiddleware`, `guardsOn`) and mock factories (`cacheMock`, `securityMock`, `storageMock`) used to mock infrastructure modules.

## Notes

- All three infrastructure mocks (`cache`, `rate-limit`, `storage`) are resolved through `@tests/routes` helpers via `jest.requireActual`, so the mock shape is defined in the shared support file, not here.
- Order assertions (`indexOf` comparisons) are load-bearing: a limiter after `isAuth`, or `isAuth` before `isAdmin`, breaks security guarantees even if both guards are present.
- `TOKEN_BEARING` routes being public is *by design* (the caller has no access token by definition at that step); the test enforces this so a "defensive" `isAuth` addition is flagged as a regression.
- The "caches nothing anywhere" test (`setCache` must not appear on any route) is the direct regression guard for the `noStore`/`setCache` ordering bug described in the file header.
