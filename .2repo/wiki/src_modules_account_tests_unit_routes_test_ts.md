# src/modules/account/tests/unit/routes.test.ts

## Purpose

Structural contract test for the account router. It asserts *what middleware is mounted, in what order, on which routes*—catching regressions a type checker cannot (e.g., a `setCache` silently overriding `noStore`, a missing second rate-limit budget, or a token-bearing route accidentally gaining an `isAuth` guard). It does not test handler logic.

## Key elements

- **`chainOf(signature)`** — resolves a route's full middleware chain by `"METHOD /path"` string, used by nearly every assertion below.
- **`TOKEN_BEARING`** — list of routes whose credential is a URL/cookie token (delete-confirm, reset-confirm, verify-confirm, refresh, logout); asserted *public* (no `isAuth`).
- **`RATE_LIMITED`** — list of seven credential routes; each must carry **both** `credentialLimiters[0]` and `credentialLimiters[1]`, and the limiters must precede `isAuth`.
- **`AUTHENTICATED`** — list of thirteen first-person routes that must carry `isAuth`.
- **`describe('… what is mounted')`** — pins the exact route signature order and verifies `noStore` is present on every route.
- **`describe('… authorization')`** — enforces auth-guard presence/absence per route, the single `isAdmin` guard on `DELETE /tokens/expired`, and that `isAuth` precedes `isAdmin`.
- **`describe('… credential rate limiting')`** — both budgets present, ordering before `isAuth`, and no credential limiters on non-credential routes.
- **`describe('… cache invalidation and uploads')`** — verifies `invalidateCache` tags per route, `upload.single(imageUpload)` + validation/quarantine on `PUT /` and `POST /signup`, and that **no** route mounts `setCache`.

## Relationships

- **`src/modules/account/routes.ts`** — the module under test. This file imports `{ router }` from it and every assertion inspects that router's mounted middleware and route table.
- **`tests/support/routes.ts`** — provides the test-infrastructure helpers: `routeTable`, `routeSignatures`, `routerMiddleware`, `guardsOn` (used for assertions) and the factories `cacheMock()`, `securityMock()`, `storageMock()` (used in the three `jest.mock` calls that substitute the real cache, rate-limit, and storage adapters with inert sentinels).

## Notes

- The three `jest.mock` calls are **mandatory** for the tests to run in isolation; they swap real infrastructure with the support-module mocks. Forgetting to add a mock when a new middleware dependency appears will cause the test to hit real I/O.
- Assertions are written against *string signatures* of middleware entries (e.g. `'credentialLimiters[0]'`, `'noStore'`), not against function references. Renaming a middleware in the source will silently break these tests with no type error.
- The file intentionally does **not** mock or test route handlers; it is a pure structural/chain test. Handler logic belongs in other test files.
- Order assertions (`indexOf` comparisons) encode real security invariants (limiters before auth, `isAuth` before `isAdmin`), not stylistic preferences.
