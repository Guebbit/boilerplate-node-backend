---
source: src/modules/account/tests/integration/idle-timeout.test.ts
sha256: 1cab66ede84966672b20ed56a6ef54d2fa0db75f4a6ef9e31f500e8d208ae6db
generated_at: 2026-10-29T02:56:06.911220+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/idle-timeout.test.ts

## Purpose

Integration tests that verify the staff idle-timeout and staff lifetime-cap enforcement over real HTTP, across both `jwt` and `cookie` session modes. They confirm that staff sessions are revoked (with `401 SESSION_IDLE` or `401 UNAUTHORIZED`) when idle too long or signed in too long, while shopper sessions are never subject to either limit, and that a `Session-Passive: true` request does not reset the idle clock.

## Key elements

- **`MODES`** – `['jwt', 'cookie'] as const`; drives `describe.each` so every suite runs in both session modes.
- **`LIMIT`** (1800 s) / **`CAP`** (86 400 s) – the staff idle and lifetime values the tests run under; overridable per-test via `setEnvironment`.
- **`signInAs(role, remember?)`** – creates a verified user, POSTs `/account/login` with `transport: 'bearer'`, and returns `{ user, bearer }`. Works for both `'customer'` and `'editor'`.
- **`signInStaff()`** – like `signInAs` but uses the cookie transport and returns a `__Host-session` cookie string for the refresh-flow tests.
- **`idleFor(userId, seconds)`** – backdates `lastUsedAt` on all session rows via `sessionModel.updateMany` to simulate inactivity.
- **`signedInFor(userId, seconds)`** – backdates `startedAt` and sets `lastUsedAt` to now, simulating a session that has been continuously active since sign-in.
- **Test suites:**
  - *Staff idle timeout* (per mode) – within-limit passes, past-limit returns `401 SESSION_IDLE` + revokes session; shopper never idles; `NODE_SESSION_IDLE_TIME_STAFF=0` disables; passive requests do not count as activity; `/account/sessions/current/touch` reports the limit for staff only.
  - *Staff idle timeout at `/account/refresh`* (jwt only) – cookie-based refresh is refused with `SESSION_IDLE` and the family is removed.
  - *Staff lifetime cap* (per mode) – boundary tests at `CAP ± 1 s`; shopper and remember-me shopper exempt; cap disabled via `NODE_SESSION_LIFETIME_STAFF=0`; `SESSION_IDLE` takes precedence over the cap; promotion to editor mid-session activates the cap from the next request; `/account/sessions` lists the cap as the session's effective expiration.
  - *Staff lifetime cap at `/account/refresh`* (jwt only) – refresh refused with plain `401` and family removed.

## Relationships

- **`tests/support/http.ts`** (`api`) – every HTTP call goes through this helper.
- **`tests/support/setup-test-db.ts`** (`setupTestDb`) – called at module top-level to provision a clean database.
- **`tests/support/environment.ts`** (`setEnvironment`) – sets `NODE_SESSION_MODE`, `NODE_SESSION_IDLE_TIME_STAFF`, and `NODE_SESSION_LIFETIME_STAFF` per test.
- **`src/modules/users/tests/factories.ts`** (`createUser`, `PLAIN_PASSWORD`) – creates users for sign-in.
- **`src/modules/account/model.ts`** (`sessionModel`) – direct Mongoose model used by `idleFor` / `signedInFor` to mutate `lastUsedAt` / `startedAt`.
- **`src/modules/account/tests/factories.ts`** (`sessionRowsOf`) – reads session rows to assert revocation or timestamp updates.
- **`tests/support/cookies.ts`** (`cookieHeader`) – extracts the `__Host-session` cookie from login responses for the refresh tests.
- **`src/modules/access/tests/factories.ts`** (`seedMembership`) – grants the editor role in the promotion test.
- **`src/kernel/access/tenant.ts`** (`DEPLOYMENT_TENANT_ID`) – tenant identifier used when seeding the editor membership.

## Notes

- The file uses `await new Promise(r => setTimeout(r, 100))` before reading `lastUsedAt` to give the server time to persist the stamp; this is a known-flakiness mitigation, not a logical requirement.
- `signInAs` handles both `login.body.token` (JWT) and `login.body.sessionToken` (cookie mode) transparently, so the bearer string always works regardless of mode.
- The promotion test (`caps a customer promoted to staff mid-session`) is the only test that mutates access-control data mid-flow; it relies on `seedMembership` writing synchronously before the next request.
- When both idle timeout and lifetime cap are exceeded simultaneously, the assertion expects `SESSION_IDLE` (not `UNAUTHORIZED`), documenting a precedence rule in the server logic.
