---
source: tests/contract/password-set-paths.test.ts
sha256: a7c4b6d3fe0efd545cfe051ad22bcf9727aa01aee6696f43f1d0ff2c28c6a218
generated_at: 2026-10-15T12:32:35.102967+00:00
model: ollama:qwen3.8:27b
---

# tests/contract/password-set-paths.test.ts

## Purpose

Contract-level test that asserts **every** HTTP route which writes a password rejects a known-breach password with a 422 and leaves no trace (no new user row, no credential change). It also pins the exhaustive set of password-setting routes against the bundled OpenAPI spec so a newly added staff or admin route that sets a password cannot appear without first gaining a breach-check case here.

## Key elements

- **`PasswordSetPath`** — interface describing one password-setting route: a `name` and an `attempt()` that fires the request and returns a `response` plus an `assertNoChange` callback.
- **`signupPath`** — exercises `POST /account/signup`; asserts no user row is created after a 422.
- **`changePath`** — exercises `POST /account/password` (authenticated); asserts the old credential still logs in after a 422.
- **`resetPath`** — exercises `POST /account/reset-confirm` (one-time token, no session); asserts the old credential still logs in after a 422.
- **`describe.each([signupPath, changePath, resetPath])`** — parameterized block that runs the 422 + no-mutation assertions for all three paths.
- **`operationsThatSetAPassword()`** — reads `openapi.yaml` from disk, walks every operation's `requestBody` schema, and collects route+method pairs whose request schema references a `PasswordNew` field.
- **`describe('the routes that can set a password')`** — canary test asserting the result of the above is *exactly* `['POST /account/password', 'POST /account/reset-confirm', 'POST /account/signup']`.

## Relationships

- **`tests/support/contract.ts`** — imported for side-effects (likely registers contract-test globals or Vitest setup).
- **`tests/support/http.ts`** — supplies `api()` (supertest instance) and `authenticateAs()` used by all three path attempts.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` is called once at module level to provision a test database.
- **`src/modules/users/tests/factories.ts`** — provides `createUser`, `PLAIN_PASSWORD`, and `userRepository` used in the reset-path setup and the signup no-mutation assertion.
- **`src/modules/account/tests/factories.ts`** — provides `plantToken` to seed a password-reset token for the reset-path test.
- **`src/modules/users/repository.ts`** — the `userRepository.findOne` call backs the signup "no row created" check.
- **`package.json`** — the `npm run contracts:bundle` script produces the `openapi.yaml` file the canary reads; dev dependencies (`yaml`, `supertest`, `vitest`) power the test.

## Notes

- The canary reads `openapi.yaml` at **runtime** via `readFileSync` relative to `__dirname/../../openapi.yaml`. If the spec file is missing or stale (i.e., `contracts:bundle` wasn't run), the canary will throw or give a false pass/fail.
- The breach password constant (`'Password1!'`) must exist in `breached-passwords/list.txt`; the comment notes this is the same fixture used by every other breach test in the repo.
- Change and reset are two *entry points* into the same `passwordChange` service function; signup is a separate implementation. The test treats them uniformly at the HTTP level, so the funneling is invisible to this file.
- The test is intentionally **system-scoped** (not tied to one module) because the invariant spans the account contract.
