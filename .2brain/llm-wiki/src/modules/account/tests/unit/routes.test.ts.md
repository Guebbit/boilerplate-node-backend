---
source: src/modules/account/tests/unit/routes.test.ts
source_sha256: abd0778bb46d5cfd829e62942151fced879b4f65cc04bfe8efd2d5a149553210
context_sha256: 6ea2c6abeda5b58f1f55b679ea2718dddaa9f38c5e53f3b6f5e8e3a5144f7691
generated_at: 2026-11-22T04:08:06.368260+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/tests/unit/routes.test.ts

## Purpose
Unit tests that pin the structure of the account module's Express router (`src/modules/account/routes.ts`). The file's header states that three arrangements matter most and are invisible to the type checker: `router.use(noStore)` must cover every route, credential routes must carry all of their rate-limit budgets, and token-bearing routes must stay public because the token is the credential. The tests inspect the router's mounted routes and middleware chains rather than making HTTP requests.

## Key elements
- **Imports from `@tests/routes`**: `routeSignatures` (lists `"METHOD /path"` strings), `routerMiddleware` (router-level `use` middleware), `guardsOn` (guards on a route) and `chainOf` (the full ordered middleware chain for a route).
- **`jest.mock` calls**: the cache, rate-limit and upload middleware modules are replaced with `cacheMock()`, `securityMock()` and `storageMock()` from `@tests/routes`. The tests read middleware labels such as `credentials-identity`, `signup-block` and `humanChallengeGate` from these mocks.
- **Route lists**:
  - `TOKEN_BEARING`: routes that are public because a URL or cookie token is the credential.
  - `RATE_LIMITED`: routes that must carry all `credentialLimiters` budgets.
  - `SESSION_KEYED`: routes where `isAuth` runs first, so the per-account budget is keyed on the signed-in account.
  - `AUTHENTICATED`: routes that must include `isAuth`.
- **Test groups (`describe`)**:
  - *What is mounted*:
    - The exact endpoint list and order.
    - Router-level middleware equals `['getAuth', 'noStore']`.
    - Every route is checked for `noStore`.
  - *Authorization*:
    - `AUTHENTICATED` routes contain `isAuth`.
    - `TOKEN_BEARING` routes, plus `POST /login`, `POST /signup` and `POST /password/reset`, do not.
    - No route uses `requirePermissionGuard`.
    - `DELETE /tokens/expired` is not mounted.
  - *Credential rate limiting*:
    - Each `RATE_LIMITED` route carries `credentials-identity` (or `credentials-signed-in` for `SESSION_KEYED` routes), then `credentials-device`, `credentials-address` and `credentials-block`, in that order.
    - `isAuth` precedes `credentials-signed-in`.
    - No other route has `credentials-*` limiters.
  - *Signup and reset rate limiting*:
    - `POST /signup` carries the three `signup-*` budgets.
    - `POST /password/reset` carries the three `reset-*` budgets.
    - Neither carries any `credentials-*` limiter.
  - *Per-mailbox mail budget*:
    - `mailRecipientLimiter` appears only on `POST /signup` and `POST /password/reset`.
    - It sits after the route's last budget label and before `humanChallengeGate`.
  - *Human-challenge gate*: `POST /signup` and `POST /password/reset` carry `humanChallengeGate` after their own rate-limit budget. The file content continues past this point.

## Relationships
- **`src/modules/account/routes.ts`**: the unit under test. The file imports its `router` and asserts on the route table and middleware order.
- **`tests/support/routes.ts`** (aliased `@tests/routes`): supplies the introspection helpers and the three middleware mocks. The mocks make limiters and guards appear as readable labels in the chains.

## Notes
- The `jest.mock` factories use `jest.requireActual` on `@tests/routes`. The mocks are therefore set up before `@modules/account/routes` is imported.
- The endpoint-order test is strict. Adding, removing or reordering a route in `routes.ts` requires updating the expected list here.
- `POST /signup` and `POST /password/reset` are intentionally excluded from `RATE_LIMITED`. The file's comments say `credentialLimiters`' `skipSuccessfulRequests` would not charge the 200/201 responses these routes give to abuse, so they use `signupLimiters` and `resetRequestLimiters` instead.
- Operational levers across all accounts, such as the inactive-account reaper, are meant to be nightly jobs (`reap:inactive-accounts`) and not routes. The tests enforce this by asserting that no route uses a permission guard.
