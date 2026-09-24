---
source: src/modules/account/tests/unit/routes.test.ts
sha256: 330bb376e5d1adb03f9f6c5c29a9c0177cf44658d3b07442ce37ff4ec03f8d39
generated_at: 2026-09-23T18:16:45.664770+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/unit/routes.test.ts

## Purpose

Unit tests that verify the **middleware arrangement** of the account router — the security-critical ordering and presence of guards, rate limiters, cache directives, and upload handlers that TypeScript cannot type-check. Each assertion encodes a specific security invariant (e.g., "limiter before auth", "noStore above every route", "token-bearing routes stay public") so that regressions in `routes.ts` are caught at the router level rather than at the HTTP-header level.

## Key elements

- **`TOKEN_BEARING`** — list of routes whose credential is a token in the URL/cookie; asserted to _lack_ `isAuth` because the token itself authenticates the call.
- **`RATE_LIMITED`** — routes that must carry all three `credentials-*` budget limiters (identity, address, block). `POST /signup` and `POST /reset` are deliberately excluded.
- **`AUTHENTICATED`** — routes that act on the caller's own account; asserted to require `isAuth`.
- **`describe('what is mounted')`** — pins the exact route table (signatures + order), asserts `routerMiddleware` is `['getAuth', 'noStore']`, and that every individual route carries `noStore`.
- **`describe('authorization')`** — per-route `isAuth` presence/absence, the sole `requirePermissionGuard` on `DELETE /tokens/expired`, and guard ordering (`isAuth` before `requirePermissionGuard`).
- **`describe('credential rate limiting')`** — each `RATE_LIMITED` route has all three `credentials-*` entries in order; limiters precede `isAuth`; no non-credential route carries any `credentials-*` entry.
- **`describe('signup and reset rate limiting')`** — `POST /signup` and `POST /reset` carry their own three-dimension budgets (`signup-*` / `reset-*`) and must **not** carry `credentials-*`.
- **`describe('human-challenge gate (rung 3)')`** — `humanChallengeGate` appears only on signup/reset, positioned after their own block-level budget.
- **`describe('cache invalidation and uploads')`** — mutating routes clear both `users` and `account` tags; `POST /logout-all` clears only `account`; `PUT /` and `POST /signup` mount `upload.single(imageUpload)` + validation + quarantine; **no route** mounts `setCache`.

## Relationships

- **`src/modules/account/routes.ts`** — the module under test. The file imports its exported `router` and inspects its middleware chain.
- **`tests/support/routes.ts`** — provides the assertion helpers (`routeSignatures`, `routerMiddleware`, `guardsOn`, `chainOf`) and the mock factories (`cacheMock`, `securityMock`, `storageMock`) used in the three `jest.mock` blocks.

## Notes

- The file header documents a **past regression** where `setCache` silently overrode `noStore` on `GET /account`; the final "caches nothing anywhere" assertion exists specifically to catch that class of bug.
- Ordering assertions (`indexOf(a) < indexOf(b)`) are load-bearing: they verify _sequence_, not just presence. A limiter after `isAuth` means every unauthenticated request pays the session-lookup cost before being rate-limited.
- `jest.mock` calls use `jest.requireActual` pointed at `@tests/routes` (the support module) rather than a literal mock path — the support file is the single source of truth for both the real helpers and the mock factories.
- `POST /signup` and `POST /reset` use `skipSuccessfulRequests` on their own budgets so that a legitimate 201/200 does not consume budget, while their own abuse (Sybil signups, mail-bombing) does.
