---
source: src/modules/account/tests/integration/idle-timeout.test.ts
sha256: 9f8bd9bce7b06ac59ab385d3ad680718ca7061f8c144b1babefb65859288a4b1
generated_at: 2026-10-15T10:11:51.708366+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/idle-timeout.test.ts

## Purpose

Integration tests for the staff idle-timeout feature over real HTTP. Verifies that a staff session idle past the configured limit is revoked with `401 SESSION_IDLE`, that shopper sessions are never idle-expired, and that passive requests (`X-Session-Passive: true`) do not reset the activity clock. All cases run in both `jwt` and `cookie` session modes via `describe.each`.

## Key elements

- **`MODES`** — `['jwt', 'cookie']`; parameterizes every test case.
- **`LIMIT`** — `1800` seconds; the staff idle threshold under test, injected via `NODE_SESSION_IDLE_TIME_STAFF`.
- **`signInAs(role)`** — Creates a user, logs in via `POST /account/login` with bearer transport, and returns the user record plus an `Authorization` header value.
- **`idleFor(userId, seconds)`** — Backdates every session row for a user by setting `lastUsedAt` to `now − seconds`, simulating elapsed inactivity without sleeping.
- **`describe.each(MODES)` block** — Seven cases covering: session still active within limit; session revoked past limit (asserts status, error code, and empty session rows); shopper never idled out; timeout disabled (`NODE_SESSION_IDLE_TIME_STAFF = '0'`); ordinary request refreshes `lastUsedAt`; passive request does not; `POST /account/session/touch` returns `idleTimeoutSeconds` for staff but omits it for shoppers.

## Relationships

- **`src/modules/account/model.ts`** — Exports `sessionModel`, used by `idleFor` to update `lastUsedAt` directly.
- **`src/modules/account/tests/factories.ts`** — Exports `sessionRowsOf(userId)`, used to inspect or assert on session rows after each operation.
- **`src/modules/users/tests/factories.ts`** — Exports `createUser` and `PLAIN_PASSWORD` for provisioning test accounts.
- **`tests/support/environment.ts`** — Exports `setEnvironment`, used in `beforeEach` and inline to set `NODE_SESSION_IDLE_TIME_STAFF` and `NODE_SESSION_MODE`.
- **`tests/support/http.ts`** — Exports `api()`, the supertest-style HTTP client used for every request in the suite.
- **`tests/support/setup-test-db.ts`** — Exports `setupTestDb`, called at module scope to initialize a clean test database.

## Notes

- Idle simulation is done by mutating `lastUsedAt` in the DB (`idleFor`), not by real waiting — the only actual sleep is a 100 ms `setTimeout` in the two "activity" tests, giving the server a moment to persist the new timestamp before the test reads it back.
- Setting `NODE_SESSION_IDLE_TIME_STAFF` to `'0'` disables the timeout entirely (one dedicated test).
- The touch-endpoint test asserts an *asymmetric* response shape: staff get `idleTimeoutSeconds`, shoppers do not.
- All tests use `transport: 'bearer'` at login; the mode (`jwt` vs `cookie`) is a server-side configuration switch, not a client-side difference in how the credential is sent.
