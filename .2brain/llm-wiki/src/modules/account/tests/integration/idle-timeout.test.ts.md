---
source: src/modules/account/tests/integration/idle-timeout.test.ts
sha256: 45655b8ab7d58c44519441ad5e90039666e723412917f3a70ef1d37a8e1e349f
generated_at: 2026-11-08T04:37:12.503810+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/idle-timeout.test.ts

## Purpose

Integration tests (over real HTTP) verifying the **staff idle timeout** and the **staff lifetime cap** across both session modes (`jwt` and `cookie`). Confirms that staff sessions are revoked with `401 SESSION_IDLE` after the idle limit, shoppers are never idled or capped, passive requests do not reset the clock, and the refresh endpoint enforces the same rules.

## Key elements

- **`MODES`** – `['jwt', 'cookie']`; drives `describe.each` so every suite runs in both session transports.
- **`LIMIT`** (1800 s) / **`CAP`** (86 400 s) – the idle and lifetime thresholds the suite configures via env vars.
- **`signInAs(role, remember?)`** – creates a user, posts to `/account/login` with `transport: 'bearer'`, returns the bearer token.
- **`idleFor(userId, seconds)`** – backdates `sessionModel.lastUsedAt` directly in the DB to simulate elapsed idle time.
- **`signInStaff()`** – signs in an editor and returns the `__Host-session` refresh cookie for the refresh-endpoint suite.
- **`signedInFor(userId, seconds)`** – backdates `startedAt` to the past and sets `lastUsedAt` to *now* (simulates a busy session past the lifetime cap).
- **Idle-timeout describe blocks** – cover: within-limit OK, past-limit revoked (`SESSION_IDLE`), public-read also returns `SESSION_IDLE`, shopper never idled, timeout disabled (`0`), ordinary request resets clock, `Session-Passive: true` header does *not* reset clock, `/account/sessions/current/touch` returns `idleTimeoutSeconds` for staff but omits it for shoppers.
- **Refresh-endpoint describe block** (jwt mode only) – confirms `/account/refresh` refuses an idled family with `SESSION_IDLE` and deletes rows; allows refresh within the limit.
- **Lifetime-cap describe blocks** – cover: past-cap revoked (`UNAUTHORIZED`, not `SESSION_IDLE`), within-cap OK, shopper never capped, cap disabled, boundary (±1 s), remember-me shopper, idle takes precedence over cap, mid-session role promotion activates the cap, session list reports cap as `expiration`.

## Relationships

- **`src/modules/account/model.ts`** – imports `sessionModel` (Mongoose model) for direct DB writes (`idleFor`, `signedInFor`) and row reads.
- **`src/modules/account/tests/factories.ts`** – imports `sessionRowsOf` to assert session-row state after revocation.
- **`src/modules/users/tests/factories.ts`** – imports `createUser` and `PLAIN_PASSWORD` to provision test accounts.
- **`src/modules/access/tests/factories.ts`** – imports `seedMembership` for the "promoted to staff mid-session" cap test.
- **`src/kernel/access/tenant.ts`** – imports `DEPLOYMENT_TENANT_ID` (the tenant scope used when seeding that membership).
- **`tests/support/http.ts`** – imports `api` (supertest wrapper) for all HTTP calls.
- **`tests/support/environment.ts`** – imports `setEnvironment` to toggle `NODE_SESSION_MODE`, `NODE_SESSION_IDLE_TIME_STAFF`, `NODE_SESSION_LIFETIME_STAFF` per test.
- **`tests/support/cookies.ts`** – imports `cookieHeader` to build the `Cookie` header for the refresh-endpoint tests.
- **`tests/support/setup-test-db.ts`** – imports `setupTestDb` (called once at module top) to prepare/tear down the database.

## Notes

- The suite writes directly to the sessions collection via `sessionModel.updateMany` to simulate the passage of time—no real waiting (except a 100 ms `setTimeout` in the clock-reset assertions).
- `SESSION_IDLE` and `UNAUTHORIZED` (cap) are **distinct error codes**; a session that is both idle and past the cap must return `SESSION_IDLE`.
- The "passive request" distinction is exercised via the `Session-Passive: true` request header, not a query param.
- The lifetime-cap boundary tests use `CAP - 1` (allowed) and `CAP + 1` (revoked) to pin the exact second; do not change these without updating the expected status.
- `NODE_SESSION_IDLE_TIME_STAFF: '0'` and `NODE_SESSION_LIFETIME_STAFF: '0'` are the "feature off" sentinels; each is tested explicitly.
