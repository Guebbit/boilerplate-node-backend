---
source: src/modules/account/tests/unit/routes.test.ts
sha256: 00da099eb2bf2b299b221b03110b3f22d9fd06d5be1f6415032841114b92340c
generated_at: 2026-09-27T14:36:52.961437+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/unit/routes.test.ts

## Purpose

Security-invariant test for the account module's Express router. It asserts that routes are mounted in the exact documented order, that every route carries the correct middleware chain (auth guards, rate-limit budgets, noStore, upload handling), and that deliberately public token-bearing routes are *not* gated by `isAuth`. The file exists because a wrong router arrangement here is an account-takeover or credential-leak bug, not a cosmetic one.

## Key elements

- **`TOKEN_BEARING`** – List of six routes where the token in the URL/cookie is itself the credential; tests assert these carry *no* `isAuth` guard.
- **`RATE_LIMITED`** – List of eleven routes that must each carry all three `credentialLimiters` budgets (`credentials-identity`, `credentials-address`, `credentials-block`). `POST /signup` and `POST /reset` are deliberately excluded.
- **`AUTHENTICATED`** – List of routes acting on the caller's own account; tests assert each carries `isAuth`.
- **`describe('account routes — what is mounted')`** – Exact route-signature order, router-level `['getAuth', 'noStore']` middleware, and per-route `noStore` presence.
- **`describe('account routes — authorization')`** – `isAuth` presence/absence per route, the single `requirePermissionGuard` on `DELETE /tokens/expired`, and guard ordering (`isAuth` before `requirePermissionGuard`).
- **`describe('account routes — credential rate limiting')`** – Three-budget presence on `RATE_LIMITED` routes, limiters-before-`isAuth` ordering, and absence of credential budgets on all other routes.
- **`describe('account routes — signup and reset rate limiting')`** – `POST /signup` and `POST /reset` carry their own three-dimension budgets (`signup-*` / `reset-*`) and must *not* carry `credentials-*`.
- **`describe('account routes — human-challenge gate (rung 3)')`** – `humanChallengeGate` appears only on signup/reset, and only *after* their rate-limit budget.
- **`describe('account routes — uploads')`** – `PUT /`, `PATCH /`, `POST /signup` carry `upload.image` + validation + quarantine; no route in the module mounts `setCache`.

## Relationships

- **`src/modules/account/routes.ts`** — The sole import under test (`router` from `@modules/account/routes`). Every assertion in this file inspects that router's mounted routes, middleware, and guard chains.
- **`tests/support/routes.ts`** — Provides the four test helpers (`routeSignatures`, `routerMiddleware`, `guardsOn`, `chainOf`) and the three mock factories (`cacheMock()`, `securityMock()`, `storageMock()`) that back the `jest.mock` calls at the top of the file.

## Notes

- The three infrastructure middlewares (cache, rate-limit, upload) are **fully mocked** so tests never hit real infrastructure; the mock factories live in `tests/support/routes.ts`.
- Route order is asserted as an **exact array match** — inserting, removing, or reordering any route fails the first test.
- The per-route `noStore` check is a regression guard: a past bug let `setCache` override `noStore` on `GET /account` because the route was mounted above the router-level `use(noStore)`. The per-route assertion catches that pattern.
- `POST /signup` and `POST /reset` use `skipSuccessfulRequests` in their limiter config, so their own successful responses don't spend budget — which is why they need a *separate* budget set rather than the shared `credentialLimiters`.
