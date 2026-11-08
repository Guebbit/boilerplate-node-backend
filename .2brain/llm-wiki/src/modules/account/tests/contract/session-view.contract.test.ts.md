---
source: src/modules/account/tests/contract/session-view.contract.test.ts
sha256: f3f2b409395ea870e9b038ddcb637ea1b917a6d9fdc05f1ae4f8693d1582aa89
generated_at: 2026-11-08T04:32:34.973936+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/contract/session-view.contract.test.ts

## Purpose

Contract test asserting that every session "door" (password sign-in, token refresh) returns the **same** abilities payload that `GET /account` would publish, so a client never needs a follow-up read. It also pins the sign-in response shape (account view, idle clock) and the negative case (wrong password yields no account view).

## Key elements

- **`signIn(email)`** – module-level helper that POSTs `/account/login` with a plain password and expects 200. Reused by both `describe` blocks.
- **`describe('a password sign-in')`** – three tests:
  - Verifies the login body includes `account` with `id`, `email`, non-empty `abilities.tenant`, absence of `subjects`, and an `activity.lastActiveAt` string.
  - Verifies `login.body.account.abilities` **deep-equals** the `abilities` returned by a subsequent `GET /account` (handles both JWT bearer and `__Host-session` cookie auth via `getSessionMode()`).
  - Verifies a 401 on wrong password and that the body has **no** `account` key.
- **`describe('a token refresh')`** – one test that POSTs `/account/refresh` with the session cookie. In `cookie` mode it expects 404 (no refresh endpoint); otherwise it expects 200 and that `abilities` match the original login.

## Relationships

- **`tests/support/contract.ts`** – imported for side effects; establishes the contract-test environment (global hooks, base URL, etc.) before any test runs.
- **`tests/support/setup-test-db.ts`** – `setupTestDb()` is called at module load to create/seed an isolated database.
- **`tests/support/http.ts`** – `api()` is the Supertest-wrapped HTTP client used for every request in this file.
- **`tests/support/cookies.ts`** – `cookieHeader()` extracts a named cookie from a response and formats it as a `Cookie` header value.
- **`src/modules/users/tests/factories.ts`** – `createUser()` and `PLAIN_PASSWORD` supply test users and the expected credential.
- **`src/modules/account/session/config.ts`** – `getSessionMode()` is read at runtime to branch the refresh test between `jwt` and `cookie` deployment modes.

## Notes

- The file is a **contract** test: it codifies the invariant "one rule set, however it arrives" across transport modes. Adding a new session door (e.g., SSO) should add a test here asserting the same abilities payload.
- `getSessionMode()` is evaluated **at test time**, not import time, so the refresh test is mode-agnostic and can run in either deployment configuration.
- The wrong-password test only asserts absence of `account`; it does not pin the 401 body shape beyond that.
