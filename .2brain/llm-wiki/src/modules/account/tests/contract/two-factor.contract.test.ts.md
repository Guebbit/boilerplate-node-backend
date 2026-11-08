---
source: src/modules/account/tests/contract/two-factor.contract.test.ts
sha256: eed19548caf670f0657f48e29713a838407178ad34e7e22f6b4e18a03dab73fc
generated_at: 2026-11-08T04:33:20.023170+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/contract/two-factor.contract.test.ts

## Purpose
Contract tests that assert the HTTP response shapes (status codes, body fields) of every two-factor-authentication endpoint against what `openapi.yaml` publishes. Behavioural correctness is covered by the separate integration suite; this file only pins the API contract — success and refusal shapes.

## Key elements
- **`mockOutbox`** — module-level array; every call to the mocked `enqueueEmail` pushes a `{ template, data }` entry here so tests can read the mailed code.
- **`jest.mock('@infrastructure/adapters/mailer', …)`** — intercepts `enqueueEmail` so no real mail is sent while still recording the payload.
- **`verifiedSession()`** — creates a verified user and returns `{ user, bearer }` ready for authenticated requests.
- **`carryOn(session)`** — re-mints a bearer via `mintSession` after a factor change has revoked the current one (bearer clients can't rely on cookie re-issuance).
- **`armTotp(session)`** — runs the two-step TOTP setup/confirm flow, stores the secret and backup codes, then calls `carryOn`.
- **`backupCodesOf: Map<string, string[]>`** — maps each TOTP secret to its one-time backup codes; used as the "second factor proof" when arming a second method.
- **`armEmail(session, proof?)`** — runs the email setup/confirm flow, reading the code from `mockOutbox`.
- **`describe` blocks** — one per endpoint (`GET /account/2fa`, `POST …/backup-codes`, `POST …/remove`, `POST …/disable`, `POST /account/login/2fa/send`, `POST …/send`, `POST …/setup`), each asserting 2xx shape or the documented 4xx error shape.

## Relationships
- **`tests/support/contract.ts`** — side-effect import that configures global contract-assertion helpers (response-shape matching against `openapi.yaml`).
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` initialises the in-memory database for the suite.
- **`tests/support/environment.ts`** — `setEnvironment({ NODE_MAIL_TRANSPORT: 'outbox' })` ensures the mail path routes to the mock rather than being dropped.
- **`tests/support/http.ts`** — `api()` (supertest wrapper) and `loginBearer()` (helper to obtain a bearer token) are used for every HTTP call.
- **`tests/support/totp.ts`** — `codeFor(secret, timeStep)` mints valid TOTP codes for confirm/send steps.
- **`src/modules/account/tests/factories.ts`** — `mintSession` re-establishes a bearer after session revocation.
- **`src/modules/users/tests/factories.ts`** — `createUser` and `PLAIN_PASSWORD` provide the test account.

## Notes
- **Session revocation is intentional:** arming, removing, or disabling a factor kills all existing sessions. Every helper that mutates factors must call `carryOn` before the next request, or the next call will 401. Forgetting this is the most common source of false failures.
- **`backupCodesOf` is module-scoped, not test-scoped:** it persists across tests within the file. It is only *written* by `armTotp` and only *read* to satisfy the second-factor proof on `armEmail`, so there is no cross-test leakage in practice, but the Map is never explicitly cleared.
- **The `NODE_MAIL_TRANSPORT` toggle** is per-test-`beforeEach`; the default (`log`) discards mail, so without it the `mockOutbox` stays empty and `armEmail` would read an undefined code.
- **Deleted legacy routes** (`DELETE /account/2fa`, `DELETE /account/2fa/methods/totp`) are explicitly tested to return 405/404, guarding against accidental re-exposure.
