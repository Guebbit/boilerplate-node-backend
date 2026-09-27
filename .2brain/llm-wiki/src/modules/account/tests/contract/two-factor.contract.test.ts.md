---
source: src/modules/account/tests/contract/two-factor.contract.test.ts
sha256: 1b72fa1cd1b4de4bed023390851d9fa0c9cd3b1081f33c3e9002cc2e42c486fa
generated_at: 2026-09-27T14:33:59.907733+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/contract/two-factor.contract.test.ts

## Purpose

Contract tests for the five two-factor authentication endpoints (status read, disable all, remove a single method, regenerate backup codes, and mail a login code). Each test asserts only that the HTTP response—success or error—conforms to the shape published in `openapi.yaml`. Business-logic assertions live in the companion integration suite; this file exists to catch schema drift between the API and its published spec.

## Key elements

- **`mockOutbox`** – Module-level array that records every call to the mocked mailer's `enqueueEmail`. Used to extract the emailed two-factor code without a real transport.
- **`jest.mock('@infrastructure/adapters/mailer')`** – Replaces `enqueueEmail` with a stub that pushes `{ template, data }` into `mockOutbox` and resolves immediately.
- **`verifiedSession()`** – Creates a user with `verifiedAt` set, logs in via `POST /account/login`, and returns `{ user, bearer }`. The email factor requires a verified address, hence the explicit timestamp.
- **`armTotp(bearer)`** – Calls `/account/2fa/methods/totp/setup`, then `/confirm` with a valid code from `codeFor(secret, 0)`. Returns the TOTP secret for later use.
- **`armEmail(bearer)`** – Calls `/account/2fa/methods/email/setup`, pulls the code from `mockOutbox` (last entry matching `account.two-factor-code`), then calls `/confirm`.
- **`describe` blocks** – One per endpoint: `GET /account/2fa`, `POST /account/2fa/backup-codes`, `DELETE /account/2fa/methods/{method}`, `DELETE /account/2fa`, `POST /account/login/2fa/send`. Each contains a success case and at least one error case, both closed with `expect(response).toSatisfyApiSpec()`.

## Relationships

- **`tests/support/contract.ts`** – Imported as a side-effect (`import '@tests/contract'`); registers the `toSatisfyApiSpec()` matcher used in every assertion.
- **`tests/support/setup-test-db.ts`** – `setupTestDb()` initialises an isolated database for the suite.
- **`tests/support/http.ts`** – Provides the `api()` helper (supertest-style) for issuing authenticated and unauthenticated requests.
- **`tests/support/totp.ts`** – `codeFor(secret, offset)` generates a valid TOTP code at a given time step; used to satisfy the confirm and challenge steps.
- **`src/modules/users/tests/factories.ts`** – `createUser` and `PLAIN_PASSWORD` supply a known-credential user for login and session establishment.

## Notes

- `mockOutbox` is cleared in `beforeEach`; if a test needs the code from a *previous* call within the same test, it must reference the array before the next setup/confirm cycle.
- The `carrier-pigeon` DELETE test is a deliberate unknown-method probe asserting a 404 contract shape, not a real feature.
- `codeFor(secret, 0)` is used for the initial confirm; `codeFor(secret, 1)` is used for subsequent challenges (backup-codes, method removal, full disable), implying a one-time-window advance to avoid reusing the same TOTP token.
- The `sentTo` field in the login-code response is masked (`a***a@example.com`); the test asserts that masked form, not the raw address.
