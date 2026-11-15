---
source: src/modules/account/tests/unit/routes.test.ts
sha256: 90f07880cf5434428b9a60976b9ff06eaf729354802094c1c8114031d1e8fc1e
generated_at: 2026-11-14T19:16:19.013206+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/unit/routes.test.ts

## Purpose
Locks in the security-relevant invariants of the account Express router: exact endpoint order, per-route middleware placement (`noStore`, `isAuth`, rate-limit budgets, mail budget, human-challenge gate), and the deliberate public exposure of token-bearing credential routes. It exists because these arrangements are invisible to TypeScript and a silent reordering would be an account-takeover vector.

## Key elements
- **`TOKEN_BEARING`** – list of routes whose credential is a URL/cookie token, not an access token; asserted public (no `isAuth`).
- **`RATE_LIMITED`** – routes that must carry all four `credentials-*` budget limiters; the expected order is identity (or signed-in) → device → address → block.
- **`SESSION_KEYED`** – subset of `RATE_LIMITED` where the first budget is `credentials-signed-in`; asserted that `isAuth` runs *before* that limiter.
- **`AUTHENTICATED`** – routes that act on the caller's own record; asserted to require `isAuth`.
- **`describe('account routes — what is mounted')`** – pins the full ordered route signature list, verifies `getAuth` + `noStore` are router-level middleware, and checks `noStore` on every individual route.
- **`describe('account routes — authorization')`** – enforces `isAuth` presence/absence per group, asserts no route uses `requirePermissionGuard`, and confirms no cross-account token-sweep route exists.
- **`describe('account routes — credential rate limiting')`** – verifies exact limiter chain and ordering for `RATE_LIMITED`; confirms non-credential routes carry no `credentials-*` entry.
- **`describe('account routes — signup and reset rate limiting')`** – `POST /signup` and `POST /password/reset` carry their own three-dimension budget (`signup-*` / `reset-*`) and must NOT carry `credentialLimiters`.
- **`describe('account routes — the per-mailbox mail budget')`** – `mailRecipientLimiter` sits after the last self-budget and before `humanChallengeGate` on those two routes; absent everywhere else.
- **`describe('account routes — human-challenge gate (rung 3)')`** – `humanChallengeGate` present and correctly ordered on signup/reset; absent elsewhere.

## Relationships
- **`src/modules/account/routes.ts`** – the sole system under test; this file imports its `router` export and inspects its middleware chain, guard set, and mounted route table.
- **`tests/support/routes.ts`** – provides the inspection helpers (`routeSignatures`, `routerMiddleware`, `guardsOn`, `chainOf`) and the factory mocks (`cacheMock`, `securityMock`, `storageMock`) used to stub the three infrastructure middleware modules.

## Notes
- The three `jest.mock` calls intercept `@infrastructure/http/middlewares/{cache,rate-limit,upload}` and delegate to helpers in `tests/support/routes.ts`, so the real middleware logic is never exercised here — only its *label* in the chain.
- `SESSION_KEYED` routes use `credentials-signed-in` rather than `credentials-identity` as the first budget; the test asserts the relative index of `isAuth` < `credentials-signed-in` to catch a swap.
- `POST /signup` and `POST /password/reset` are explicitly excluded from `RATE_LIMITED`; they use a separate `signup-*` / `reset-*` budget family. Mixing them would be a security regression (successful abuse spends nothing on `credentialLimiters` due to `skipSuccessfulRequests`).
- Route ordering is asserted as a full array equality (`toEqual`), not a set — a reordering of endpoints is treated as a breaking change.
