---
source: src/modules/account/tests/contract/two-factor.contract.test.ts
sha256: 7436848aeb68030f8fab447af7e11c8409b7fb8714095847c670dfcfe68f0ec4
generated_at: 2026-10-14T14:40:06.739643+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/contract/two-factor.contract.test.ts

## Purpose

Contract tests for the two-factor authentication endpoints. Each test asserts that the HTTP response (status code and body shape) matches what `openapi.yaml` publishes for that operation—covering the status read, arming/removing factors, regenerating backup codes, and mailing login codes. The behavioural logic lives in `integration/two-factor.test.ts`; this file only pins the API surface.

## Key elements

- **`mockOutbox`** — module-level array that captures every call to the mocked `enqueueEmail`, so tests can read the mailed code and template.
- **`Session` interface** — pairs a `createUser` result with a `Bearer` token string; the unit of "signed-in caller" throughout the file.
- **`verifiedSession()`** — creates a verified user (`verifiedAt` set) and logs in, returning a `Session`. Verification is required because the email factor refuses unverified addresses.
- **`carryOn(session)`** — re-mints a bearer token via `mintSession` with `amr: ['pwd', 'otp']` after a factor change has revoked the current session.
- **`armTotp(session)`** — POSTs `/setup` then `/confirm` for the TOTP method using a code from `codeFor`, stores the returned backup codes in `backupCodesOf`, and carries the session forward.
- **`backupCodesOf`** — `Map<string, string[]>` keyed by TOTP secret; holds the backup codes each armed secret produced (used as proof when arming a second factor).
- **`armEmail(session, proof?)`** — POSTs `/setup` (with a proof code if a second factor), pulls the mailed code from `mockOutbox`, POSTs `/confirm`, and carries the session forward.
- **`describe` blocks** — one per endpoint: `GET /account/2fa`, `POST /account/2fa/backup-codes`, `DELETE /account/2fa/methods/{method}`, `DELETE /account/2fa`, `POST /account/login/2fa/send`, `POST /account/2fa/methods/{method}/send`, and `POST /account/2fa/methods/{method}/setup`.

## Relationships

- **`tests/support/contract.ts`** — side-effect import (`@tests/contract`) that installs the OpenAPI shape-matching assertions used implicitly by `expect`.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` initialises the test database before any test runs.
- **`tests/support/environment.ts`** — `setEnvironment({ NODE_MAIL_TRANSPORT: 'outbox' })` in `beforeEach` ensures the mail pipeline "delivers" into the mock outbox rather than dropping.
- **`tests/support/http.ts`** — `api()` builds supertest-style request chains; `loginBearer()` performs a password login and returns the bearer token.
- **`tests/support/session-epoch.ts`** — `forgetSessionEpoch(bearer)` invalidates the server-side session-epoch cache so the next request after `carryOn` is not rejected as stale.
- **`tests/support/totp.ts`** — `codeFor(secret, offset)` generates a valid TOTP code for the given offset into the 30-second window.
- **`src/modules/account/tests/factories.ts`** — `mintSession(userId, { amr })` creates a fresh bearer token representing a post-factor-change session.
- **`src/modules/users/tests/factories.ts`** — `createUser(opts)` and `PLAIN_PASSWORD` seed a known user for login.

## Notes

- The mailer adapter is jest-mocked at module level; no real email is ever sent. Tests read the code directly from `mockOutbox`.
- Arming or removing a factor **revokes every active session** for that account. Every helper that changes a factor calls `forgetSessionEpoch` + `carryOn` to restore a valid bearer, or subsequent requests will 401.
- `codeFor(secret, N)` advances N × 30 s past the current window, so tests use `codeFor(secret, 1)` *after* setup (which consumed window 0) to stay within a valid window.
- The `sentTo` field in mail responses is masked (e.g. `a***a@example.com`); tests assert the masked form, not the raw address.
