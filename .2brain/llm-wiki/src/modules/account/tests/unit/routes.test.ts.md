---
source: src/modules/account/tests/unit/routes.test.ts
sha256: 5c16ec49480e5b65a7ef725ee0d6b40f85d6a81d8194c8e897efc28b0f622267
generated_at: 2026-10-14T09:23:01.780210+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/unit/routes.test.ts

## Purpose

Unit test for the account router (`src/modules/account/routes.ts`) that pins down security-critical middleware arrangements invisible to the type system: that `noStore` covers every route, that credential routes carry all four `credentials-*` limiter dimensions, that token-bearing routes remain public, and that signup/reset use their own budget dimensions rather than the shared credential limiters. Exists because a past regression let `setCache` override `noStore` on `GET /account`.

## Key elements

- **`TOKEN_BEARING`** — array of 7 routes (e.g. `DELETE /delete-confirm`, `POST /logout`) whose credential is a URL/cookie token; asserted to lack `isAuth`.
- **`RATE_LIMITED`** — array of 14 routes that must carry all four `credentials-*` limiters in exact order (`identity`, `device`, `address`, `block`).
- **`AUTHENTICATED`** — array of 23 routes that require a live session (`isAuth` guard).
- **`describe('account routes — what is mounted')`** — asserts the exact route signature list and order, and that every route's guard chain includes `noStore`.
- **`describe('account routes — authorization')`** — verifies `isAuth` presence/absence per route group, confirms zero routes use `requirePermissionGuard`, and that `DELETE /tokens/expired` is absent.
- **`describe('account routes — credential rate limiting')`** — checks `credentials-*` chain, asserts `isAuth` precedes `credentials-identity` on session-keyed routes, and that no non-RATE_LIMITED route carries a credential budget.
- **`describe('account routes — signup and reset rate limiting')`** — asserts `POST /signup` and `POST /reset` each carry their own three-dimension budget (`signup-*` / `reset-*`) and carry **no** `credentials-*` entry.
- **`describe('account routes — the per-mailbox mail budget')`** — verifies `mailRecipientLimiter` sits after the route's own block limiter and before `humanChallengeGate`; absent on all other routes.
- **`describe('account routes — human-challenge gate (rung 3)')`** — confirms `humanChallengeGate` is mounted only on signup/reset, ordered after the respective budget.
- **`describe('account routes — uploads')`** — checks `upload.image` is present on `PUT /` and `PATCH /` chains (truncated in source).

## Relationships

- **`src/modules/account/routes.ts`** — the system under test. The file imports `router` from it and inspects the router's middleware chain, guard chain, and route table via helpers.
- **`tests/support/routes.ts`** — provides the test toolkit: `routeSignatures`, `routerMiddleware`, `guardsOn`, `chainOf` for querying the router, and `cacheMock()`, `securityMock()`, `storageMock()` factory functions used inside the three `jest.mock` calls at the top of the file.

## Notes

- **Ordering assertions, not just presence.** Several tests use `chain.indexOf(a) < chain.indexOf(b)` to enforce relative ordering (e.g. `isAuth` before `credentials-identity`, `mailRecipientLimiter` after `signup-block` but before `humanChallengeGate`). A route that has the right middleware in the wrong order will fail.
- **Signup/reset are deliberately excluded from `RATE_LIMITED`.** Their `skipSuccessfulRequests` flag means the shared credential limiter would not count their own abuse patterns (Sybil signup, mail-bombing reset), so they carry separate `signup-*`/`reset-*` dimensions instead.
- **Token-bearing routes being public is intentional, not a missing guard.** A caller completing a password reset or logging out has no (or is destroying) an access token by definition; adding `isAuth` would break the flow.
- **All three infrastructure middlewares are mocked at module level** before importing `router`, so the test inspects named labels (`noStore`, `credentials-identity`, etc.) rather than real middleware behavior.
