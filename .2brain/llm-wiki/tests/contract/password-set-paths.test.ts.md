---
source: tests/contract/password-set-paths.test.ts
sha256: df973e678e4eca12bfbe24eda1ea3c61d7bc1e706554ff1ae63efcbd2d50343f
generated_at: 2026-09-27T15:47:48.310408+00:00
model: ollama:qwen3.8:27b
---

# tests/contract/password-set-paths.test.ts

## Purpose

Contract test for the **S10 password-set-paths** rule: every code path that writes a password must reject a breached password with a 422 and leave no side-effect. It was introduced after bug **B25** (admin-create skipped the breach check entirely) and lives at the system level because the five affected paths span both the `account` and `users` modules.

## Key elements

- **`PasswordSetPath`** (interface) — describes one entry point by `name` and an `attempt()` that returns the HTTP `response` plus an `assertNoChange` closure proving no state was written.
- **`BREACHED_PASSWORD`** (`'Password1!'`) — a fixed fixture from `breached-passwords/list.txt`, chosen so that rejection is attributable to the breach list rather than to composition/validator rules.
- **`signupPath`** — `POST /account/signup`; verifies no user row is created.
- **`changePath`** — `POST /account/password`; verifies the original password still logs in.
- **`resetPath`** — `POST /account/reset-confirm` (one-time token, no session); same no-change assertion as change.
- **`adminCreatePath`** — `POST /users` (admin bearer); verifies no user row is created.
- **`adminUpdatePath`** — `PUT /users/{id}` (admin bearer); verifies the target's original password still logs in.
- **`describe.each([...])`** — drives all five paths through a single `it` block: expects status 422 and calls `assertNoChange`.

## Relationships

- **`tests/support/contract.ts`** — side-effect import (`@tests/contract`) that registers the S10 contract metadata for reporting.
- **`tests/support/http.ts`** — provides `api()` (supertest wrapper) and `authenticateAs()` used by every path.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` is called once at module top to prepare a clean database.
- **`src/modules/users/tests/factories.ts`** — supplies `createUser`, `PLAIN_PASSWORD`, and `userRepository` for fixture creation and no-change assertions.
- **`src/modules/users/index.ts`** — source of the `TokenType` enum used to issue the reset token in `resetPath`.
- **`src/modules/users/repository.ts`** — the `userRepository` instance (imported via factories) is queried inside `assertNoChange` for create paths.
- **`src/modules/users/model.ts`** — underlying model for the user rows that `createUser` and `userRepository` operate on.

## Notes

- `changePath` and `resetPath` share one internal implementation (`passwordChange` in `account/services/profile.ts`); the test deliberately exercises them as two independent HTTP entry points rather than deduplicating the check.
- The no-change assertion strategy differs by path: create paths check for a missing row via the repository; update/change/reset paths confirm the **old** password still authenticates. There is no single uniform assertion.
- `resetPath` mints its own token (`'breach-reset-token'`) via `user.tokenAdd` rather than going through the reset-request flow, keeping the test scoped to the confirm endpoint.
- The file uses `setupTestDb()` at module scope (not in a `beforeAll`), consistent with other contract tests in `tests/contract/`.
