---
source: src/modules/account/tests/unit/routes.test.ts
sha256: 1689d52f9fe7b1f78edd76908bed91841506aa5573840e285eba035025aa26ef
generated_at: 2026-10-15T10:15:34.600981+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/unit/routes.test.ts

## Purpose

Route-table contract test for the account module's Express router. It asserts that every endpoint is mounted, that security middleware (auth guards, rate-limit budgets, no-store, human-challenge gate, mail-recipient budget) is present, correctly scoped, and in the correct order on each route. The file exists to make regressions in middleware placement or scope visible immediately, since those regressions are invisible to the type checker.

## Key elements

- **`TOKEN_BEARING`** — list of routes that must stay public (no `isAuth`) because the URL token or cookie *is* the credential (e.g. `POST /reset-confirm`, `POST /logout`).
- **`RATE_LIMITED`** — routes that must carry all four credential limiter dimensions (`credentials-identity|session`, `-device`, `-address`, `-block`).
- **`SESSION_KEYED`** — subset of `RATE_LIMITED` where the per-account budget is keyed on the session rather than the body, requiring `isAuth` to run *before* the limiter.
- **`AUTHENTICATED`** — routes that must carry the `isAuth` guard.
- **`describe('account routes — what is mounted', …)`** — asserts exact route list and order, global middleware (`getAuth`, `noStore`), and per-route `noStore` coverage.
- **`describe('account routes — authorization', …)`** — verifies `isAuth` presence/absence per route group; asserts no `requirePermissionGuard` and no cross-account sweep routes exist.
- **`describe('account routes — credential rate limiting', …)`** — checks all four budget labels per route, `isAuth`-before-limiter ordering on `SESSION_KEYED` routes, and absence of credential limiters on non-credential routes.
- **`describe('account routes — signup and reset rate limiting', …)`** — asserts `signup-*` / `reset-*` three-dimension budgets exist and that `credentialLimiters` is *not* present on those two routes.
- **`describe('account routes — the per-mailbox mail budget', …)`** — verifies `mailRecipientLimiter` placement (after the route's own budget, before `humanChallengeGate`) on signup/reset only.
- **`describe('account routes — human-challenge gate (rung 3)', …)`** — asserts `humanChallengeGate` is present after the route budget on signup/reset and absent everywhere else.
- **`describe('account routes — uploads', …)`** — (truncated in source) begins asserting upload-related middleware on `PUT /` and `PATCH /`.

## Relationships

- **`src/modules/account/routes.ts`** — the router instance under test; this file imports `{ router }` from it and asserts every structural property of that export.
- **`tests/support/routes.ts`** — provides the assertion helpers (`routeSignatures`, `routerMiddleware`, `guardsOn`, `chainOf`) and mock factories (`cacheMock`, `securityMock`, `storageMock`) consumed via `jest.mock` + `jest.requireActual` at the top of the file.

## Notes

- The file is **order-sensitive**: several assertions compare `indexOf` positions within a middleware chain, not just membership. A route that has the right middlewares in the wrong order will fail.
- Mocks are wired through `jest.requireActual('@tests/routes')` rather than inline factories, so the mock definitions live in the shared support module and stay in sync with production middleware names.
- The `RATE_LIMITED` list deliberately **excludes** `POST /signup` and `POST /reset`; those routes use their own three-dimension budgets (`signup-*` / `reset-*`) and must *not* carry `credentials-*` limiters. The test enforces both inclusion and exclusion.
- The file is truncated in the source provided; the uploads section and any subsequent sections are incomplete.
