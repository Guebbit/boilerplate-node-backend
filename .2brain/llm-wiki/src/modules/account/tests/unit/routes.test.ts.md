---
source: src/modules/account/tests/unit/routes.test.ts
sha256: 9d46a35c6b52ce192df3531fbfc9a2c5e07020deeb01aaaf8deff1a8c2965438
generated_at: 2026-11-08T04:49:15.053919+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/unit/routes.test.ts

## Purpose

Unit test that pins the full surface of the account router: which endpoints exist, in what order, which middleware guards each one, and in what sequence those guards run. It exists because the account routes are security-critical (a misplaced `isAuth`, a missing rate-limit budget, or a missing `noStore` is an account takeover), and those invariants are invisible to the type system.

## Key elements

- **`TOKEN_BEARING`** — list of routes whose credential is a token in the URL/cookie (restore, confirm, refresh, logout). Asserted to be *public* (no `isAuth`).
- **`RATE_LIMITED`** — list of routes that must carry all four `credentials-*` budget limiters (identity/session, device, address, block).
- **`SESSION_KEYED`** — subset of `RATE_LIMITED` where `isAuth` runs *before* the limiter so the per-account budget keys on the session rather than the IP block.
- **`AUTHENTICATED`** — routes that require a live session; asserted to include `isAuth` in their guard chain.
- **`describe("…what is mounted")`** — asserts the exact ordered list of route signatures, global `getAuth → noStore` middleware, and per-route `noStore` coverage.
- **`describe("…authorization")`** — verifies `isAuth` presence/absence per route, confirms no route uses `requirePermissionGuard`, and that no bulk token-sweep route exists.
- **`describe("…credential rate limiting")`** — checks the exact four-limiter chain per `RATE_LIMITED` route, enforces ordering for `SESSION_KEYED`, and confirms no `credentials-*` limiter leaks onto non-credential routes.
- **`describe("…signup and reset rate limiting")`** — asserts `POST /signup` and `POST /password/reset` carry their own three-dimension budgets (`signup-*` / `reset-*`) and *no* `credentials-*` limiters.
- **`describe("…per-mailbox mail budget")`** — verifies `mailRecipientLimiter` appears only on signup/reset, positioned after the route's own budgets and before the challenge gate.
- **`describe("…human-challenge gate (rung 3)")`** — verifies `humanChallengeGate` appears only on signup/reset, after the last budget limiter.

## Relationships

- **`src/modules/account/routes.ts`** — the router under test. The file imports `router` and every assertion interrogates its mounted endpoints, middleware chain, and guard ordering.
- **`tests/support/routes.ts`** — provides the introspection helpers (`routeSignatures`, `routerMiddleware`, `guardsOn`, `chainOf`) and the mock factories (`cacheMock`, `securityMock`, `storageMock`) used in the `jest.mock` calls.

## Notes

- **Order is tested, not just presence.** Several assertions use `chainOf` + `indexOf` to verify middleware *sequence* (e.g., `isAuth` before `credentials-session`; `mailRecipientLimiter` before `humanChallengeGate`). A route can carry the right guards and still fail if they run in the wrong order.
- **`POST /signup` and `POST /password/reset` are deliberately absent from `RATE_LIMITED`.** They use their own budget labels (`signup-*` / `reset-*`) because `credentialLimiters` with `skipSuccessfulRequests` would not spend on the 200/201 responses those routes return for their own abuse patterns.
- **Token-bearing public routes are intentional, not a gap.** A caller completing a password reset has no access token; `isAuth` would break the flow.
- **No `requirePermissionGuard` anywhere.** Cross-account operations (e.g., reaping inactive accounts) live in nightly jobs, not in this router.
- The three `jest.mock` calls reference `@tests/routes` via `requireActual` to reuse the shared mock factories, avoiding duplicated stub logic.
