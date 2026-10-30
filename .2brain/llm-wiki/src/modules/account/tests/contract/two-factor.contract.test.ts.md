---
source: src/modules/account/tests/contract/two-factor.contract.test.ts
sha256: eed19548caf670f0657f48e29713a838407178ad34e7e22f6b4e18a03dab73fc
generated_at: 2026-10-29T02:52:59.889652+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/contract/two-factor.contract.test.ts

## Purpose

Contract tests that verify the HTTP response shapes (status codes, field presence, types) of the second-factor authentication endpoints against the definitions published in `openapi.yaml`. Business-logic assertions live in `integration/two-factor.test.ts`; this file only checks that each success and refusal answer matches the published contract.

## Key elements

- **`mockOutbox`** – module-level array; captures every `enqueueEmail` call (template + data) instead of sending mail.
- **`jest.mock('@infrastructure/adapters/mailer')`** – replaces `enqueueEmail` with a recorder so no real mail is dispatched.
- **`Session`** – interface pairing a created user with a `Bearer` token for subsequent authenticated calls.
- **`verifiedSession()`** – creates a verified user and returns a logged-in session.
- **`carryOn(session)`** – re-mints a bearer token after a factor change has revoked all sessions (calls `mintSession` with `amr: ['pwd','otp']`).
- **`armTotp(session)`** – performs TOTP setup + confirm, records the backup codes in `backupCodesOf`, and carries the session on.
- **`backupCodesOf`** – `Map<string, string[]>` linking each armed secret to its one-time backup codes (used as "proof" for a second factor).
- **`armEmail(session, proof?)`** – performs email setup (optionally with a proof code), reads the mailed code from `mockOutbox`, confirms, and carries on.
- **`describe` blocks** – one per endpoint group: `GET /account/2fa`, `POST …/backup-codes`, `POST …/methods/{method}/remove`, `POST …/disable`, `POST /account/login/2fa/send`, `POST …/methods/{method}/send`, and `POST …/methods/{method}/setup` (second-method guard). Each asserts status codes and body shape only.

## Relationships

| Neighbor | Interaction |
|---|---|
| `tests/support/contract.ts` | Side-effect import (`@tests/contract`) that installs the OpenAPI shape-assertion matcher used implicitly by `expect`. |
| `tests/support/setup-test-db.ts` | `setupTestDb()` is called once at module scope to provision an isolated database. |
| `tests/support/environment.ts` | `setEnvironment({ NODE_MAIL_TRANSPORT: 'outbox' })` runs in `beforeEach` so the "mail delivers" gate is open without a real transport. |
| `tests/support/http.ts` | `api()` provides the `supertest`-style request helper; `loginBearer()` authenticates and returns the bearer string. |
| `src/modules/account/tests/factories.ts` | `mintSession` is called inside `carryOn` to re-establish a bearer after session revocation. |
| `tests/support/totp.ts` | `codeFor(secret, step)` generates a valid TOTP code for the given step index. |
| `src/modules/users/tests/factories.ts` | `createUser` builds the test account; `PLAIN_PASSWORD` supplies the known password for the login-challenge test. |

## Notes

- **No real mail is sent.** The mailer is globally mocked; `mockOutbox` is the only channel for reading what "would have" been delivered. The `NODE_MAIL_TRANSPORT` env var is set to `'outbox'` purely to satisfy a server-side gate (`mailDelivers`) — the mock intercepts before any I/O.
- **Session revocation is the reason `carryOn` exists.** Arming or removing any 2FA factor invalidates every existing session. The helper re-mints a bearer so the test can continue; omitting it causes the next request to get `401`.
- **Second-method proof requirement.** Arming a *second* factor (e.g. email after TOTP) requires a valid code from an already-armed factor. `backupCodesOf` stores those codes during `armTotp` so `armEmail` can pass one.
- **Contract vs. integration split.** This file deliberately avoids asserting *why* a response is correct (e.g. token rotation logic, code expiry). Those concerns belong to the integration suite; mixing them here would couple contract stability to implementation detail.
- **Legacy endpoint tombstone.** The `is gone at the old DELETE addresses` test documents that `DELETE /account/2fa` returns 405 and `DELETE /account/2fa/methods/totp` returns 404, locking in the removal of the old API surface.
