---
source: src/modules/account/tests/unit/routes.test.ts
sha256: 2816477fbd3bab3e897e7130775e5e9afa2bccdf4762134c955820a4c25fa1ba
generated_at: 2026-10-29T03:05:35.765459+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/unit/routes.test.ts

## Purpose

Security-invariant tests for the account router. The file asserts that middleware presence, ordering, and authorization placement match the documented contract — invariants a type checker cannot see (e.g. `noStore` must cover every route, credential routes must carry all four rate-limit dimensions, token-bearing routes must stay public). A single mis-order or missing guard on any of these routes is an account-takeover vector.

## Key elements

- **`TOKEN_BEARING`** — list of routes (e.g. `POST /restore`, `POST /logout`) that must NOT carry `isAuth` because the token/cookie in the URL *is* the credential.
- **`RATE_LIMITED`** — routes that must carry all four `credentials-*` limiters (identity/session, device, address, block). `POST /signup` and `POST /password/reset` are deliberately excluded.
- **`SESSION_KEYED`** — subset of `RATE_LIMITED` where `isAuth` must precede `credentials-session` in the chain so the per-account budget is keyed on the session rather than the IP block.
- **`AUTHENTICATED`** — routes that require a live session (`isAuth` guard present).
- **`describe('account routes — what is mounted')`** — asserts the exact endpoint list and order, that router-level middleware is `['getAuth', 'noStore']`, and that every individual route carries `noStore`.
- **`describe('account routes — authorization')`** — verifies `isAuth` on authenticated routes, absence of `isAuth` on token-bearing and session-initiating routes, absence of any `requirePermissionGuard`, and absence of a cross-account token-sweep route.
- **`describe('account routes — credential rate limiting')`** — checks the four `credentials-*` limiters on each `RATE_LIMITED` route, ordering of `isAuth` vs `credentials-session`, and that non-credential routes carry no `credentials-*` limiter.
- **`describe('account routes — signup and reset rate limiting')`** — asserts `POST /signup` carries `signup-{identity,address,block}` and `POST /password/reset` carries `reset-{identity,address,block}`, and that neither carries any `credentials-*` limiter.
- **`describe('account routes — the per-mailbox mail budget')`** — asserts `mailRecipientLimiter` appears after the last budget and before `humanChallengeGate` on signup/reset, and on no other route.
- **`describe('account routes — human-challenge gate')`** — asserts `humanChallengeGate` ordering after the route's own budget, and absence on all other routes.
- **Jest mocks** — `cache`, `rate-limit`, and `upload` middlewares are mocked via factory helpers from the test-support module so the router's real middleware names appear in the chain without side-effects.

## Relationships

- **`src/modules/account/routes.ts`** — the router under test; imported as `router` and inspected via the helper functions.
- **`tests/support/routes.ts`** — provides the inspection helpers (`routeSignatures`, `routerMiddleware`, `guardsOn`, `chainOf`) and mock factories (`cacheMock`, `securityMock`, `storageMock`) consumed by the `jest.mock` calls.

## Notes

- **Order assertions are load-bearing.** Several tests check not just *that* a middleware is present but *where* it sits relative to others (e.g. `isAuth` < `credentials-session`; budget < `mailRecipientLimiter` < `humanChallengeGate`). A re-order that preserves presence will still fail these tests.
- **`POST /signup` and `POST /password/reset` are intentionally NOT in `RATE_LIMITED`.** They carry their own three-dimension budgets (`signup-*` / `reset-*`) because `credentialLimiters`'s `skipSuccessfulRequests` would not spend budget on the 201/200 responses these routes return on their own abuse. Adding them to `RATE_LIMITED` would double-count.
- **Mocks resolve through `jest.requireActual` on the test-support module.** The factory functions (`cacheMock()`, `securityMock()`, `storageMock()`) live in `tests/support/routes.ts`, not in the infrastructure modules themselves — a non-obvious indirection that keeps the real middleware code out of the test process.
- **No route may use `requirePermissionGuard`.** Authorization on this router is purely "are you signed in?" — cross-account operations (e.g. reaping inactive accounts) are expected to live in nightly jobs, not HTTP routes.
