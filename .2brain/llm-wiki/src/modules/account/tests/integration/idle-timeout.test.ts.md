---
source: src/modules/account/tests/integration/idle-timeout.test.ts
source_sha256: c8cedbf295f3e4b95d7f678df81829d51e76b2725eb7220901bca51b0b98e9f9
context_sha256: a0fd7b368f1ec500d43b42ce94e1751aea116aecb59e3ecd72598ae241f09ac7
generated_at: 2026-11-22T03:55:45.626955+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/tests/integration/idle-timeout.test.ts

## Purpose
Integration test suite that exercises the staff idle timeout and staff session lifetime cap over real HTTP, in both session modes (`jwt` and `cookie`). It verifies that idle staff sessions are ended with `401 SESSION_IDLE` and revoked, that shoppers are never idled out, and that requests marked passive don't count as activity.

## Key elements
- `MODES` — `['jwt', 'cookie']`; the suites run under `describe.each` for each mode.
- `LIMIT` (1800 s) — the staff idle limit, set via `NODE_SESSION_IDLE_TIME_STAFF` in a top-level `beforeEach`.
- `signInAs(role, remember?)` — creates a verified `customer` or `editor` user, logs in via `POST /account/login` with `transport: 'bearer'`, and returns the user plus a `Bearer` header.
- `idleFor(userId, seconds)` — back-dates `lastUsedAt` on the user's sessions via `sessionModel.updateMany`.
- `signInStaff()` — logs in a staff user without a bearer transport and returns the `__Host-session` refresh cookie (via `cookieHeader`).
- `signedInFor(userId, seconds)` — back-dates `startedAt` while keeping `lastUsedAt` current.
- `CAP` (86,400 s) — the staff lifetime cap used in the lifetime suite.
- Test groups:
  - **Idle timeout per mode**:
    - Within-limit sessions carry on.
    - Past-limit sessions get `401 SESSION_IDLE` and their session rows are removed. This also applies to public reads such as `/products`.
    - Shoppers are never idled out.
    - A limit of `0` disables the timeout.
    - Ordinary requests update `lastUsedAt`; requests with the `Session-Passive: true` header do not.
    - The `activity` payload on `GET /account` reports `idleTimeoutSeconds`, `idleRemainingSeconds` and `lifetimeRemainingSeconds`. Staff get these values; shoppers don't. Lifetime is omitted when the cap is `0`.
    - `POST /account/sessions/current/touch` returns the idle clock for staff only, and `lastActiveAt` for shoppers.
  - **`POST /account/refresh` (jwt mode)** — an idled-out staff family gets `401 SESSION_IDLE` and the family is removed. A family within the limit refreshes with 200.
  - **Lifetime cap per mode** — a busy staff session older than the cap gets a plain `401 UNAUTHORIZED` and is revoked. Sessions inside the cap, shoppers, and a disabled cap are all unaffected.

## Relationships
- `tests/support/http.ts` (`api`), `tests/support/setup-test-db.ts` (`setupTestDb`), `tests/support/environment.ts` (`setEnvironment`) and `tests/support/cookies.ts` (`cookieHeader`) provide the HTTP client, DB lifecycle, env overrides and cookie extraction.
- `src/modules/users/tests/factories.ts` supplies `createUser` and `PLAIN_PASSWORD`.
- `src/modules/account/model.ts` supplies `sessionModel`, which is used to manipulate session timestamps directly.
- `src/modules/account/tests/factories.ts` supplies `sessionRowsOf`, used to assert sessions were revoked.
- `src/kernel/access/tenant.ts` (`DEPLOYMENT_TENANT_ID`) and `src/modules/access/tests/factories.ts` (`seedMembership`) are imported. Their use is not visible in the shown portion of the file.

## Notes
- Time is simulated by rewriting `lastUsedAt` and `startedAt` in the DB rather than by faking clocks.
- The last-used stamp is written off the request path, so tests wait 100 ms before reading it.
- Reported `idleRemainingSeconds` is floored, so the client countdown never outlasts the server's. Assertions use narrow ranges to allow for this.
- With a passive request, remaining idle time is computed from the saved stamp. With an ordinary request, it is computed from now.
- Idle expiry returns `SESSION_IDLE`. Lifetime-cap expiry returns a generic `UNAUTHORIZED`.
